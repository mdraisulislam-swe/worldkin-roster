import { freshDb } from './apply.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/[\\/]+$/, '');
const seed = readFileSync(`${R}/supabase/seed/demo_seed.sql`, 'utf8');
const out = [];
const check = (id, d, c, info) => out.push(`${c ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${d}${c ? '' : '  -> ' + JSON.stringify(info).slice(0, 250)}`);
const q = async (db, s, p) => { try { return { ok: true, rows: (await db.query(s, p)).rows }; } catch (e) { return { ok: false, msg: e.message }; } };
async function as(db, uid, s, p) {
  await db.exec('begin; set local role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  try { const r = await db.query(s, p); await db.exec('commit'); return { ok: true, rows: r.rows }; }
  catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message }; }
}
async function anon(db, s) {
  await db.exec('begin; set local role anon');
  await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  try { const r = await db.query(s); await db.exec('commit'); return { ok: true, rows: r.rows }; }
  catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message }; }
}

// 1) prerequisites missing -> nothing written
{
  const { db } = await freshDb(`${R}/supabase/migrations`);
  const r = await q(db, seed);
  const n = (await q(db, 'select count(*)::int n from public.organizations')).rows[0].n;
  check('E0', 'missing demo users -> SEED_PREREQUISITES_MISSING, 0 rows written', !r.ok && r.msg.includes('SEED_PREREQUISITES_MISSING') && n === 0, { r, n });
}

// 2) happy path
const { db } = await freshDb(`${R}/supabase/migrations`);
const ids = {};
for (const n of ['founder', 'demo.orgadmin', 'demo.coordinator', 'demo.volunteer1', 'demo.volunteer2'])
  ids[n] = (await q(db, `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`,
    [n === 'founder' ? 'founder@private.invalid' : `${n}@worldkin.test`])).rows[0].id;
await q(db, `update public.profiles set platform_role='platform_admin' where id=$1`, [ids.founder]);
const nonTestBefore = (await q(db, `select coalesce(json_agg(to_jsonb(p) order by p.id), '[]'::json) s from public.profiles p join auth.users u on u.id = p.id where u.email not like '%@worldkin.test'`)).rows[0].s;
const r1 = await q(db, seed);
check('E1', 'seed runs successfully as one transaction', r1.ok, r1);
const c = (await q(db, `select
  (select count(*)::int from public.organizations) orgs,
  (select count(*)::int from public.organizations where status='verified') verified,
  (select count(*)::int from public.org_members) members,
  (select count(*)::int from public.opportunities) opps,
  (select count(*)::int from public.shifts) shifts,
  (select count(*)::int from public.shifts where starts_at < now()) past_shifts,
  (select count(*)::int from public.signups) signups,
  (select count(*)::int from public.participation_records) records,
  (select count(*)::int from public.org_members m join public.profiles p on p.id=m.user_id where p.platform_role='platform_admin') admin_memberships`)).rows[0];
check('E2', 'counts: 3 orgs (2 verified), 4 memberships, 7 opportunities, 9 shifts (2 past), 3 signups, 2 records',
  c.orgs === 3 && c.verified === 2 && c.members === 4 && c.opps === 7 && c.shifts === 9 && c.past_shifts === 2 && c.signups === 3 && c.records === 2, c);
check('E3', 'platform admin is not a member of any organization', c.admin_memberships === 0, c);
const r2 = await q(db, seed);
check('E4', 're-running is refused (SEED_ALREADY_APPLIED)', !r2.ok && r2.msg.includes('SEED_ALREADY_APPLIED'), r2);

const imp = await as(db, ids['demo.volunteer1'], `select public.my_impact() r`);
check('E5', 'volunteer1 impact: 7 verified hours, 2 shifts, 2 organizations', Number(imp.rows?.[0]?.r?.verified_hours) === 7 && imp.rows[0].r.shifts_attended === 2 && imp.rows[0].r.organizations_helped === 2, imp);
const orgA = (await q(db, `select id from public.organizations where slug='dhaka-food-relief'`)).rows[0].id;
const dash = await as(db, ids['demo.orgadmin'], `select public.org_dashboard($1) r`, [orgA]);
const dd = dash.rows?.[0]?.r;
check('E6', 'org A dashboard: attended 1, no-show 1 (50%), 4 verified hours, draft 1',
  dd?.attended === 1 && dd.no_show === 1 && Number(dd.no_show_rate_pct) === 50 && Number(dd.verified_hours) === 4 && dd.opportunities.draft === 1, dd);
const s = await anon(db, `select title, is_sensitive from public.search_opportunities(p_limit => 50)`);
check('E7', 'anon search: 5 public opportunities, none sensitive, no draft', s.ok && s.rows.length === 5 && s.rows.every(r => !r.is_sensitive), s);
const ss = await as(db, ids['demo.volunteer1'], `select count(*)::int n from public.search_opportunities(p_limit => 50)`);
check('E8', 'signed-in search also shows the sensitive opportunity (6)', ss.rows?.[0]?.n === 6, ss);
const demoShift = (await q(db, `select s.id from public.shifts s where s.title like 'Distribution team%'`)).rows[0].id;
const j = await as(db, ids['demo.volunteer2'], `select public.join_shift($1, gen_random_uuid()) r`, [demoShift]);
check('E9', 'skill-gated demo shift rejects volunteer2 without matching skill', !j.ok && j.msg.includes('WK_NOT_ELIGIBLE'), j);
const j2 = await as(db, ids['demo.coordinator'], `select public.join_shift($1, gen_random_uuid()) r`, [demoShift]);
check('E10', 'coordinator (first aid) can join the skill-gated shift', j2.ok && j2.rows[0].r.status === 'confirmed', j2);
const audit = (await q(db, `select count(*)::int n, count(*) filter (where actor_id is null)::int op from public.audit_logs`)).rows[0];
check('E11', 'seed writes are audited as operator actions (actor_id null)', audit.n > 20 && audit.op >= 20, audit);
const lab = (await q(db, `select
  (select count(*)::int from public.organizations where name not like '%(Demo)' or description not like 'Demo organization%') orgs_unlabelled,
  (select count(*)::int from public.opportunities where title not like '%(Demo%' or description not like 'Demo%') opps_unlabelled,
  (select count(*)::int from public.shifts where coalesce(title,'') not like '%Demo%') shifts_unlabelled,
  (select count(*)::int from public.profiles p join auth.users u on u.id=p.id where u.email like 'demo.%@worldkin.test' and p.full_name not like '%(Demo)') demo_profiles_unlabelled,
  (select full_name from public.profiles where id=$1) founder_name,
  (select platform_role::text from public.profiles where id=$1) founder_role,
  (select count(*)::int from public.profiles p join auth.users u on u.id=p.id where u.email not like '%@worldkin.test' and p.updated_at > p.created_at) non_test_profiles_changed`, [ids.founder])).rows[0];
check('E12', 'every seeded org/opportunity/shift/demo profile is labelled Demo', lab.orgs_unlabelled === 0 && lab.opps_unlabelled === 0 && lab.shifts_unlabelled === 0 && lab.demo_profiles_unlabelled === 0, lab);
const nonTestAfter = (await q(db, `select coalesce(json_agg(to_jsonb(p) order by p.id), '[]'::json) s from public.profiles p join auth.users u on u.id = p.id where u.email not like '%@worldkin.test'`)).rows[0].s;
check('E13', 'Founder and every non-test profile byte-identical before vs after seed; Founder still platform_admin',
  JSON.stringify(nonTestBefore) === JSON.stringify(nonTestAfter) && lab.founder_role === 'platform_admin', { before: nonTestBefore, after: nonTestAfter });
console.log(out.join('\n'));
