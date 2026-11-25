// Proves rollback_wk06.sql restores the exact pre-wk06 schema:
//   A = wk01..wk05            B = wk01..wk06 + rollback_wk06
// The catalog fingerprints (tables, columns, constraints, indexes, triggers,
// functions incl. body hash, ACLs, policies, types) of A and B must be equal,
// and wk06 must apply cleanly again after the rollback (retry safety).
// Usage: node rollback_check.mjs <repo>/supabase
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const migDir = join(root, 'migrations');
const stub = readFileSync(new URL('./supabase_stub.sql', import.meta.url), 'utf8');
const files = readdirSync(migDir).filter(f => f.endsWith('.sql') && !f.includes('_storage')).sort();
const wk06 = files.find(f => f.includes('_wk06_'));
const base = files.filter(f => f < wk06);

async function db(list, extra = []) {
  const d = new PGlite({ extensions: { btree_gist } });
  await d.exec(stub);
  for (const f of list) await d.exec('begin;\n' + readFileSync(join(migDir, f), 'utf8') + '\ncommit;');
  for (const sql of extra) await d.exec('begin;\n' + sql + '\ncommit;');
  return d;
}
const FP = `
select jsonb_build_object(
 'columns', (select jsonb_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') order by 1) from information_schema.columns where table_schema='public'),
 'constraints', (select jsonb_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid) order by 1) from pg_constraint where connamespace='public'::regnamespace),
 'indexes', (select jsonb_agg(indexdef order by 1) from pg_indexes where schemaname='public'),
 'triggers', (select jsonb_agg(pg_get_triggerdef(oid) order by 1) from pg_trigger where not tgisinternal),
 'functions', (select jsonb_agg(proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||md5(prosrc)||':'||coalesce(proacl::text,'')||':'||prosecdef order by 1) from pg_proc p where pronamespace='public'::regnamespace),
 'table_acl', (select jsonb_agg(relname||':'||coalesce(relacl::text,'')||':'||relrowsecurity order by 1) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
 'column_acl', (select jsonb_agg(table_name||'.'||column_name||':'||grantee||':'||privilege_type order by 1) from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated')),
 'policies', (select jsonb_agg(tablename||':'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'') order by 1) from pg_policies where schemaname='public'),
 'types', (select jsonb_agg(typname order by 1) from pg_type where typnamespace='public'::regnamespace and typtype='e')
) fp`;
const fp = async d => (await d.query(FP)).rows[0].fp;

const rollback = readFileSync(join(root, 'rollback', 'rollback_wk06.sql'), 'utf8');
const A = await fp(await db(base));
const dB = await db([...base, wk06], [rollback]);
const B = await fp(dB);
let same = true;
for (const k of Object.keys(A)) {
  const a = JSON.stringify([...(A[k] ?? [])].sort()), b = JSON.stringify([...(B[k] ?? [])].sort());
  if (a !== b) {
    same = false;
    const sa = new Set(A[k] ?? []), sb = new Set(B[k] ?? []);
    console.log(`DIFF ${k}\n  only before: ${[...sa].filter(x => !sb.has(x)).slice(0, 5).join(' | ')}\n  only after rollback: ${[...sb].filter(x => !sa.has(x)).slice(0, 5).join(' | ')}`);
  }
}
console.log(`${same ? 'PASS' : 'FAIL'}  RB1  schema after wk06 + rollback is identical to wk01..wk05 (${Object.keys(A).length} catalog sections)`);
let again = true;
try { await dB.exec('begin;\n' + readFileSync(join(migDir, wk06), 'utf8') + '\ncommit;'); } catch (e) { again = false; console.log(e.message); }
console.log(`${again ? 'PASS' : 'FAIL'}  RB2  wk06 applies again cleanly after the rollback`);
let retry = false;
try { await dB.exec('begin;\n' + readFileSync(join(migDir, wk06), 'utf8') + '\ncommit;'); } catch { retry = true; await dB.exec('rollback').catch(() => {}); }
const intact = (await dB.query(`select count(*)::int n from pg_tables where schemaname='public'`)).rows[0].n === 17;
console.log(`${retry && intact ? 'PASS' : 'FAIL'}  RB3  applying wk06 twice fails atomically and leaves the schema intact (17 tables)`);
process.exit(same && again && retry && intact ? 0 : 1);
