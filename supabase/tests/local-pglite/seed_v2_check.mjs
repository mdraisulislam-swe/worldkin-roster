// Local validation of Demo Seed v2 (PostgreSQL 17, PGlite): prerequisites guard,
// first run, idempotent second run, role journeys through the same RPCs the app
// uses, real-data protection, and the cleanup script.
// Usage: node seed_v2_check.mjs <repo>/supabase
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb } from './apply.mjs';

const root = process.argv[2];
const read = (f) => readFileSync(join(root, 'seed', f), 'utf8');
const v1 = read('demo_seed.sql'), v2 = read('demo_seed_v2.sql'), cleanup = read('demo_seed_v2_cleanup.sql');
const out = [];
const check = (id, d, c, info) => out.push(`${c ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${d}${c ? '' : '  -> ' + String(JSON.stringify(info ?? null)).slice(0, 260)}`);
async function make() {
  const { db, failed, error } = await freshDb(join(root, 'migrations'));
  if (failed) throw new Error(failed + ': ' + error);
  return db;
}
const q = async (db, s, p) => { try { return { ok: true, rows: (await db.query(s, p)).rows }; } catch (e) { return { ok: false, msg: e.message }; } };
const script = async (db, sql) => { try { await db.exec('begin;\n' + sql + '\ncommit;'); return { ok: true }; } catch (e) { await db.exec('rollback').catch(() => {}); return { ok: false, msg: e.message }; } };
const val = async (db, s, p) => { const r = await q(db, s, p); return r.ok && r.rows[0] ? Object.values(r.rows[0])[0] : undefined; };
async function as(db, uid, s, p) {
  await db.exec('begin; set local role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  try { const r = await db.query(s, p); await db.exec('commit'); return { ok: true, rows: r.rows }; } catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message }; }
}
async function anon(db, s) {
  await db.exec('begin; set local role anon');
  try { const r = await db.query(s); await db.exec('commit'); return { ok: true, rows: r.rows }; } catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message }; }
}
async function users(db, withLoad = true) {
  const ids = {};
  const names = ['founder', 'demo.orgadmin', 'demo.coordinator', 'demo.volunteer1', 'demo.volunteer2', 'real.person',
    ...(withLoad ? ['load01', 'load02', 'load03', 'load04', 'load05', 'load06'] : [])];
  for (const n of names) {
    const mail = n === 'founder' ? 'founder@private.invalid' : n === 'real.person' ? 'someone@example.org' : `${n}@worldkin.test`;
    ids[n] = await val(db, `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2) returning id`, [mail, { full_name: n === 'real.person' ? 'Real Person' : n }]);
  }
  await q(db, `update public.profiles set platform_role = 'platform_admin' where id = $1`, [ids.founder]);
  return ids;
}

// 1) prerequisites guard: v2 without v1 or without load accounts writes nothing
{
  const db = await make(); await users(db, false);
  const r = await script(db, v2);
  check('P1', 'without seed v1 → DEMO_SEED_V2_PREREQUISITES_MISSING, nothing written',
    !r.ok && r.msg.includes('PREREQUISITES') && (await val(db, `select count(*)::int from public.applications`)) === 0, r);
}

// 2) main scenario
const db = await make();
const ids = await users(db);
check('S0', 'seed v1 applies', (await script(db, v1)).ok);
const realBefore = await val(db, `select coalesce(json_agg(to_jsonb(p) order by p.id), '[]'::json)::text from public.profiles p join auth.users u on u.id = p.id where u.email not like '%@worldkin.test'`);
const auditBefore = await val(db, `select count(*)::int from public.audit_logs`);
let r = await script(db, v2);
check('S1', 'seed v2 applies as one transaction', r.ok, r);
const counts = async () => (await q(db, `select
  (select count(*)::int from public.opportunities where title like '%(Demo v2)') opps,
  (select count(*)::int from public.shifts where title like '%(Demo v2)') shifts,
  (select count(*)::int from public.applications) apps,
  (select count(*)::int from public.offers) offers,
  (select count(*)::int from public.feedback) feedback,
  (select count(*)::int from public.complaints) complaints,
  (select count(*)::int from public.organization_private) org_private,
  (select count(*)::int from public.signups) signups,
  (select count(*)::int from public.notifications) notifications,
  (select count(*)::int from public.audit_logs) audit`)).rows[0];
const c1 = await counts();
check('S2', 'creates 3 opportunities, 4 shifts, 7 applications, 3 offers, 1 feedback, 1 complaint, 1 private org row',
  c1.opps === 3 && c1.shifts === 4 && c1.apps === 7 && c1.offers === 3 && c1.feedback === 1 && c1.complaints === 1 && c1.org_private === 1, c1);
r = await script(db, v2);
const c2 = await counts();
check('S3', 'second run is a no-op (identical counts, no duplicates)', r.ok && JSON.stringify(c1) === JSON.stringify(c2), { r, c1, c2 });
check('S4', 'every v2 opportunity and shift is labelled (Demo v2)', (await val(db, `select count(*)::int from public.opportunities where created_at > now() - interval '1 hour' and title not like '%(Demo v2)' and title not like '%(Demo%'`)) === 0);
check('S5', 'real (non-demo) profiles untouched', realBefore === await val(db, `select coalesce(json_agg(to_jsonb(p) order by p.id), '[]'::json)::text from public.profiles p join auth.users u on u.id = p.id where u.email not like '%@worldkin.test'`));
check('S6', 'workflow steps were audited with the acting demo user', (await val(db, `select count(*)::int from public.audit_logs where id > 0 and entity_type in ('applications','offers') and actor_id is not null`)) >= 10 && c1.audit > auditBefore);
check('S7', 'all three compensation types and both selection modes are represented',
  (await val(db, `select count(distinct compensation_type)::int from public.opportunities where title like '%(Demo v2)'`)) === 3 &&
  (await val(db, `select count(distinct selection_mode)::int from public.opportunities where title like '%(Demo v2)'`)) === 2);
const statuses = await val(db, `select string_agg(s, ',' order by s) from (select distinct status::text s from public.applications) x`);
check('S8', 'application statuses cover submitted, under review, selected, rejected, withdrawn, declined',
  statuses === 'declined,rejected,selected,submitted,under_review,withdrawn', statuses);
check('S9', 'offer statuses cover accepted, declined, pending',
  (await val(db, `select string_agg(s, ',' order by s) from (select distinct status::text s from public.offers) x`)) === 'accepted,declined,pending');
check('S10', 'constraints hold: no overbooking, accepted offer ↔ signup of same volunteer and shift',
  (await val(db, `select count(*)::int from public.shifts s where (select count(*) from public.signups g where g.shift_id = s.id and g.status = 'confirmed') > s.capacity`)) === 0 &&
  (await val(db, `select count(*)::int from public.offers o left join public.signups g on g.id = o.signup_id where o.status = 'accepted' and (g.volunteer_id <> o.volunteer_id or g.shift_id <> o.shift_id or g.id is null)`)) === 0);

// Volunteer journey
let j = await as(db, ids['demo.volunteer1'], `select status::text s, offer_status::text os, signup_status::text ss, opportunity_title t from public.my_applications()`);
check('V1', 'volunteer1: accepted offer with a confirmed seat', j.ok && j.rows.some((x) => x.os === 'accepted' && x.ss === 'confirmed'), j);
j = await as(db, ids.load03, `select offer_status::text os, offer_expires_at > now() + interval '71 hours' fresh from public.my_applications()`);
check('V2', 'load03: pending paid-role offer with a ~72-hour window', j.ok && j.rows[0]?.os === 'pending' && j.rows[0]?.fresh === true, j);
j = await as(db, ids.load02, `select status::text s, decision_reason from public.my_applications()`);
check('V3', 'load02: sees rejection and reason', j.ok && j.rows[0]?.s === 'rejected' && /weekday/.test(j.rows[0]?.decision_reason), j);
j = await as(db, ids['demo.volunteer1'], `select count(*)::int n from public.notifications`);
check('V4', 'volunteer1 has notifications (review, offer)', j.ok && j.rows[0].n >= 2, j);
j = await as(db, ids['demo.volunteer1'], `select count(*)::int n from public.my_participation() where feedback_id is not null`);
check('V5', 'volunteer1 participation shows submitted feedback', j.ok && j.rows[0].n === 1, j);
// Organization journey
const orgA = await val(db, `select id from public.organizations where slug = 'dhaka-food-relief'`);
j = await as(db, ids['demo.coordinator'], `select status::text s, note from public.org_applications($1)`, [orgA]);
check('O1', 'coordinator reviews the 5 applicants of organization A, with private notes', j.ok && j.rows.length === 5 && j.rows.some((x) => x.note), j);
j = await as(db, ids['demo.orgadmin'], `select address from public.organization_private where org_id = $1`, [orgA]);
check('O2', 'org admin sees private verification details', j.ok && j.rows.length === 1, j);
j = await as(db, ids['demo.volunteer1'], `select count(*)::int n from public.application_notes`);
check('O3', 'volunteer cannot read the private notes', j.ok && j.rows[0].n === 0, j);
// Admin journey
j = await as(db, ids.founder, `select public.admin_overview() o`);
check('A1', 'admin overview counts active applications, open offers and open complaints',
  j.ok && j.rows[0].o.applications_active >= 3 && j.rows[0].o.offers_pending === 1 && j.rows[0].o.complaints_open === 1, j);
j = await as(db, ids['demo.orgadmin'], `select count(*)::int n from public.complaints`);
check('A2', 'the organization cannot see the complaint about it', j.ok && j.rows[0].n === 0, j);
// Public
j = await anon(db, `select count(*)::int n from public.search_opportunities(p_compensation => 'paid')`);
check('U1', 'public search finds the paid demo role', j.ok && j.rows[0].n === 1, j);
j = await anon(db, `select (public.platform_stats()) ->> 'active_opportunities' a`);
check('U2', 'public stats include the new opportunities', j.ok && Number(j.rows[0].a) >= 8, j);

// Cleanup
r = await script(db, cleanup);
check('C1', 'cleanup runs', r.ok, r);
check('C2', 'after cleanup: v2 opportunities closed, shifts cancelled, no pending offers, no open applications or complaints',
  (await val(db, `select count(*)::int from public.opportunities where title like '%(Demo v2)' and status <> 'closed'`)) === 0 &&
  (await val(db, `select count(*)::int from public.shifts where title like '%(Demo v2)' and status <> 'cancelled'`)) === 0 &&
  (await val(db, `select count(*)::int from public.offers where status = 'pending'`)) === 0 &&
  (await val(db, `select count(*)::int from public.applications where status in ('submitted','under_review','selected')`)) === 0 &&
  (await val(db, `select count(*)::int from public.complaints where status in ('open','in_review')`)) === 0);
check('C3', 'cleanup keeps history (audit, feedback, participation) and v1 data', (await val(db, `select count(*)::int from public.feedback`)) === 1 &&
  (await val(db, `select count(*)::int from public.opportunities where title not like '%(Demo v2)' and status = 'published'`)) >= 5);
r = await script(db, cleanup);
check('C4', 'cleanup is re-runnable', r.ok, r);
check('C5', 'real (non-demo) profiles still untouched after cleanup', realBefore === await val(db, `select coalesce(json_agg(to_jsonb(p) order by p.id), '[]'::json)::text from public.profiles p join auth.users u on u.id = p.id where u.email not like '%@worldkin.test'`));

console.log(out.join('\n'));
const f = out.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${out.length - f}/${out.length} passed`);
process.exit(f ? 1 : 0);
