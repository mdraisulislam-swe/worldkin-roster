// Local simulation of migration wk07 on PostgreSQL 17 (PGlite) with a minimal
// stand-in for Supabase's storage schema (buckets, objects with RLS, foldername).
// Exercises every storage policy per role, then the rollback and a retry.
// The real Storage service is verified live by live_storage_check.mjs.
// Usage: node storage_check.mjs <repo>/supabase
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb } from './apply.mjs';

const root = process.argv[2];
const { db, failed, error } = await freshDb(join(root, 'migrations'));
if (failed) { console.log('MIGRATION FAILED', failed, error); process.exit(1); }
const wk07 = readFileSync(join(root, 'migrations', '20261125194425_wk07_storage.sql'), 'utf8');
const rollback = readFileSync(join(root, 'rollback', 'rollback_wk07.sql'), 'utf8');

// Same shape as Supabase storage for the parts wk07 touches.
await db.exec(`
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid, created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[]; begin _parts := string_to_array(name, '/'); return _parts[1:array_length(_parts, 1) - 1]; end $$;
`);

const results = [];
const uid = {};
async function run(role, sub, sql, params = []) {
  await db.exec('begin');
  try {
    if (role) {
      await db.exec(`set local role ${role}`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    }
    const r = await db.query(sql, params);
    await db.exec('commit');
    return { ok: true, rows: r.rows, affected: r.affectedRows };
  } catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message }; }
}
const as = (n, s, p) => run('authenticated', uid[n], s, p);
const anon = (s, p) => run('anon', null, s, p);
const op = (s, p) => run(null, null, s, p);
const check = (id, d, c, info) => results.push(`${c ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${d}${c ? '' : '  -> ' + String(JSON.stringify(info ?? null)).slice(0, 220)}`);
// Multi-statement scripts (migration / rollback) run as one transaction, like apply_migration.
const script = async (sql) => {
  try { await db.exec(`begin;\n${sql}\ncommit;`); return { ok: true }; }
  catch (e) { await db.exec('rollback').catch(() => {}); return { ok: false, msg: e.message }; }
};
const val = (r) => (r.ok && r.rows[0] ? Object.values(r.rows[0])[0] : undefined);

let r = await script(wk07);
check('A1', 'wk07 applies cleanly', r.ok, r);
r = await script(wk07);
check('A2', 'applying wk07 twice fails atomically (policies already exist)', !r.ok, r);
check('A3', 'buckets created once with limits', val(await op(`select count(*)::int from storage.buckets where (id='avatars' and public and file_size_limit=2097152) or (id='org-docs' and not public and file_size_limit=5242880)`)) === 2);
check('A4', 'helpers run as SECURITY INVOKER', val(await op(`select count(*)::int from pg_proc where proname in ('storage_folder_writable','storage_org_doc_readable') and not prosecdef`)) === 2);
check('A5', 'anonymous cannot execute the helpers', val(await op(`select count(*)::int from pg_proc where proname in ('storage_folder_writable','storage_org_doc_readable') and has_function_privilege('anon', oid, 'execute')`)) === 0);

for (const n of ['admin', 'oa', 'co', 'ob', 'vol']) uid[n] = val(await op(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [`${n}@worldkin.test`]));
await op(`update public.profiles set platform_role = 'platform_admin' where id = $1`, [uid.admin]);
const orgA = val(await as('oa', `select public.create_organization('Org A', 'org-a', 'health', 'BD')`));
const orgB = val(await as('ob', `select public.create_organization('Org B', 'org-b', 'health', 'BD')`));
await op(`insert into public.org_members (org_id, user_id, role) values ($1, $2, 'coordinator')`, [orgA, uid.co]);
const put = (who, bucket, path) => (who ? as(who, `insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, path]) : anon(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, path]));
const canSee = async (who, path) => val(await (who ? as(who, `select count(*)::int from storage.objects where name = $1`, [path]) : anon(`select count(*)::int from storage.objects where name = $1`, [path])));
const doc = `${orgA}/cert.pdf`;

check('D1', 'org admin uploads into own organization folder', (await put('oa', 'org-docs', doc)).ok);
check('D2', 'coordinator cannot upload documents', !(await put('co', 'org-docs', `${orgA}/c.pdf`)).ok);
check('D3', 'org admin cannot upload into another organization', !(await put('oa', 'org-docs', `${orgB}/x.pdf`)).ok);
check('D4', 'nobody can put org-docs into a personal folder', !(await put('vol', 'org-docs', `${uid.vol}/x.pdf`)).ok);
check('D5', 'anonymous cannot upload', !(await put(null, 'org-docs', `${orgA}/a.pdf`)).ok);
check('D6', 'coordinator of the organization can read the document', (await canSee('co', doc)) === 1);
check('D7', 'platform admin can read the document', (await canSee('admin', doc)) === 1);
check('D8', 'other organization admin cannot read it', (await canSee('ob', doc)) === 0);
check('D9', 'volunteer cannot read it', (await canSee('vol', doc)) === 0);
check('D10', 'anonymous cannot read it', (await canSee(null, doc)) === 0);
r = await as('oa', `delete from storage.objects where name = $1`, [doc]);
check('D11', 'documents cannot be deleted (0 rows)', r.ok && r.affected === 0 && (await canSee('co', doc)) === 1, r);
r = await as('oa', `update storage.objects set name = $2 where name = $1`, [doc, `${orgB}/moved.pdf`]);
check('D12', 'documents cannot be moved/renamed (0 rows)', r.ok && r.affected === 0, r);
check('D13', 'odd paths never error, just deny', !(await put('oa', 'org-docs', `not-a-uuid/x.pdf`)).ok && !(await put('oa', 'org-docs', `x.pdf`)).ok);

const av = `${uid.vol}/me.png`;
check('V1', 'volunteer uploads own avatar', (await put('vol', 'avatars', av)).ok);
check('V2', 'volunteer cannot write into another user folder', !(await put('vol', 'avatars', `${uid.co}/x.png`)).ok);
check('V3', 'org admin uploads organization logo', (await put('oa', 'avatars', `${orgA}/logo.png`)).ok);
check('V4', 'coordinator cannot replace organization logo', !(await put('co', 'avatars', `${orgA}/logo2.png`)).ok);
check('V5', 'owner sees own avatar row; others and anonymous cannot list it', (await canSee('vol', av)) === 1 && (await canSee('co', av)) === 0 && (await canSee(null, av)) === 0);
r = await as('co', `delete from storage.objects where name = $1`, [av]);
check('V6', 'others cannot delete someone’s avatar', r.ok && r.affected === 0, r);
r = await as('vol', `delete from storage.objects where name = $1`, [av]);
check('V7', 'owner can delete own avatar (test cleanup works)', r.ok && r.affected === 1, r);

r = await script(rollback);
check('R1', 'rollback runs; non-empty buckets are kept', r.ok && val(await op(`select count(*)::int from storage.buckets`)) === 2, r);
check('R2', 'rollback removed all wk07 policies and helpers',
  val(await op(`select count(*)::int from pg_policies where schemaname='storage'`)) === 0 &&
  val(await op(`select count(*)::int from pg_proc where proname in ('storage_folder_writable','storage_org_doc_readable')`)) === 0);
check('R3', 'after rollback signed-in users see no stored objects (deny by default)', (await canSee('co', doc)) === 0);
await op(`delete from storage.objects`);
r = await script(rollback);
check('R4', 'rollback is re-runnable and removes empty buckets', r.ok && val(await op(`select count(*)::int from storage.buckets`)) === 0, r);
r = await script(wk07);
check('R5', 'wk07 applies again after rollback', r.ok, r);

console.log(results.join('\n'));
const failedN = results.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${results.length - failedN}/${results.length} passed`);
process.exit(failedN ? 1 : 0);
