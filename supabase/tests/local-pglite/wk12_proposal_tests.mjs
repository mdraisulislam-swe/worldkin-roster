// Local-only checks for supabase/proposals/wk12_location_emergency.sql (NOT applied to any live database).
// Usage: node wk12_proposal_tests.mjs <repo>/supabase
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb } from './apply.mjs';

const root = process.argv[2];
const { db, failed, error } = await freshDb(join(root, 'migrations'));
if (failed) { console.log('MIGRATION FAILED', failed, error); process.exit(1); }
await db.exec('begin;\n' + readFileSync(join(root, 'proposals', 'wk12_location_emergency.sql'), 'utf8') + '\ncommit;');

const results = [], uid = {};
async function run(role, sub, sql, params = []) {
  await db.exec('begin');
  try {
    if (role) {
      await db.exec(`set local role ${role}`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    }
    const r = await db.query(sql, params); await db.exec('commit'); return { ok: true, rows: r.rows, affected: r.affectedRows };
  } catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message, code: e.code }; }
}
const as = (n, s, p) => run('authenticated', uid[n], s, p);
const anon = (s, p) => run('anon', null, s, p);
const op = (s, p) => run(null, null, s, p);
const check = (id, desc, cond, detail) => results.push({ id, pass: !!cond, desc, detail: cond ? '' : JSON.stringify(detail ?? null).slice(0, 240) });
const err = (id, desc, r, needle) => check(id, desc, !r.ok && String(r.msg).includes(needle), r);
const val = (r) => (r.ok && r.rows[0] ? Object.values(r.rows[0])[0] : undefined);

for (const n of ['admin', 'o1', 'o2', 'v1', 'v2', 'v3', 'v4', 'x']) {
  uid[n] = val(await op(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1,$2,now()) returning id`, [`${n}@wk.test`, { full_name: `${n.toUpperCase()} Person` }]));
}
await op(`update public.profiles set platform_role='platform_admin' where id=$1`, [uid.admin]);
const org1 = val(await as('o1', `select public.create_organization('Relief One','relief-one','humanitarian','BD','desc',null)`));
const org2 = val(await as('o2', `select public.create_organization('Unverified Two','unverified-two','humanitarian','BD','desc',null)`));
check('SETUP', 'two organizations created', org1 && org2, { org1, org2 });
const rv = await as('admin', `select public.review_organization($1,'verified',null)`, [org1]);
check('SETUP2', 'org1 verified by platform admin', rv.ok, rv);

// --- A. opt-in, rounding, privacy
const up = await as('v1', `select public.upsert_emergency_profile(true,'bd','Sylhet',24.89491,91.86871,'{First aid}')`);
check('A1', 'volunteer opts in through the RPC', up.ok, up);
const row = await as('v1', `select area_lat::text, area_lng::text, country_code from public.emergency_profiles`);
check('A2', 'coordinates stored rounded to 0.05° (~5 km)', row.ok && row.rows[0]?.area_lat === '24.90' && row.rows[0]?.area_lng === '91.85', row);
const other = await as('v2', `select count(*)::int n from public.emergency_profiles`);
check('A3', 'another user cannot read emergency profiles', val(other) === 0, other);
err('A4', 'direct insert into emergency_profiles is denied', await as('v2', `insert into public.emergency_profiles (user_id, opted_in) values (auth.uid(), true)`), 'permission denied');
err('A5', 'anonymous visitor cannot read profiles table', await anon(`select * from public.emergency_profiles`), 'permission denied');
await as('v2', `select public.upsert_emergency_profile(true,'BD','sylhet',null,null,'{}')`);
const c2 = await anon(`select * from public.emergency_area_counts('BD')`);
check('A6', 'k-anonymity: city with 2 volunteers is hidden from public counts', c2.ok && c2.rows.length === 0, c2);
await as('v3', `select public.upsert_emergency_profile(true,'BD','Sylhet ',null,null,'{Driving}')`);
const c3 = await anon(`select * from public.emergency_area_counts('BD')`);
check('A7', 'with 3 opted-in volunteers the public sees only a city count', c3.ok && c3.rows.length === 1 && c3.rows[0].volunteers === 3 && c3.rows[0].city === 'Sylhet' && !('user_id' in c3.rows[0]), c3);
await as('v3', `select public.upsert_emergency_profile(false,'BD','Sylhet',null,null,'{}')`);
check('A8', 'opting out removes the volunteer from counts', (await anon(`select * from public.emergency_area_counts('BD')`)).rows.length === 0);

// --- B. requests
const args = `($1,'flood','Sandbag team needed','Help fill and place sandbags along the river barrier this evening.','BD','Sylhet','{First aid}',8,'high','in_app','',24)`;
err('B1', 'unverified organization cannot post', await as('o2', `select public.create_emergency_request${args}`, [org2]), 'only verified organizations');
err('B2', 'non-member cannot post for another organization', await as('x', `select public.create_emergency_request${args}`, [org1]), 'only members');
err('B3', 'anonymous cannot call the RPC', await anon(`select public.create_emergency_request${args}`, [org1]), 'permission denied');
const req = await as('o1', `select public.create_emergency_request${args}`, [org1]);
check('B4', 'verified organization member posts a request', req.ok, req);
const rid = val(req);
const notified = await op(`select array_agg(user_id order by user_id) u from public.notifications where kind='emergency_request'`);
const got = notified.rows[0].u ?? [];
check('B5', 'only opted-in matching volunteers are notified (v1, v2; not v3 who opted out, not v4)', got.length === 2 && got.includes(uid.v1) && got.includes(uid.v2) && !got.includes(uid.v4), got);
err('B6', 'rate limit: same person cannot post twice within an hour', await as('o1', `select public.create_emergency_request${args}`, [org1]), 'rate limit');
err('B7', 'expiry over 72 h is rejected by the table check', await op(`insert into public.emergency_requests (org_id,created_by,category,title,description,country_code,city,volunteers_needed,urgency,contact_method,expires_at) values ($1,$2,'flood','Long request here','A description that is certainly longer than thirty characters.','BD','Sylhet',1,'low','in_app',now()+interval '100 hours')`, [org1, uid.o1]), 'check constraint');
err('B8', 'direct insert into requests is denied for users', await as('o1', `insert into public.emergency_requests (org_id,created_by,category,title,description,country_code,city,volunteers_needed,urgency,contact_method,expires_at) values ($1,auth.uid(),'flood','Direct insert try','A description that is certainly longer than thirty characters.','BD','Sylhet',1,'low','in_app',now()+interval '1 hour')`, [org1]), 'permission denied');
check('B9', 'signed-in volunteer can see the live request', val(await as('v4', `select count(*)::int from public.emergency_requests`)) === 1);
err('B10', 'volunteer who did not opt in cannot respond', await as('v4', `select public.respond_emergency_request($1,true)`, [rid]), 'opt in');
const r1 = await as('v1', `select public.respond_emergency_request($1,true)`, [rid]);
const r1b = await as('v1', `select public.respond_emergency_request($1,true)`, [rid]);
check('B11', 'responding is idempotent (one row)', r1.ok && r1b.ok && val(await op(`select count(*)::int from public.emergency_responses where request_id=$1`, [rid])) === 1);
const seen = await as('o1', `select * from public.emergency_responders($1)`, [rid]);
check('B12', 'organization sees responder first name only', seen.ok && seen.rows.length === 1 && seen.rows[0].first_name === 'V1' && Object.keys(seen.rows[0]).length === 2, seen);
check('B13', 'another volunteer cannot see responses of others', val(await as('v2', `select count(*)::int from public.emergency_responses`)) === 0);
check('B14', 'non-member gets no responders', (await as('x', `select * from public.emergency_responders($1)`, [rid])).rows?.length === 0);
// lifecycle
err('B15', 'invalid transition open -> resolved rejected', await as('o1', `select public.set_emergency_request_status($1,'resolved')`, [rid]), 'invalid status change');
err('B16', 'non-member cannot change status', await as('x', `select public.set_emergency_request_status($1,'cancelled')`, [rid]), 'only the posting organization');
check('B17', 'open -> responders_found -> resolved', (await as('o1', `select public.set_emergency_request_status($1,'responders_found')`, [rid])).ok && (await as('o1', `select public.set_emergency_request_status($1,'resolved')`, [rid])).ok);
err('B18', 'resolved is final', await as('o1', `select public.set_emergency_request_status($1,'cancelled')`, [rid]), 'invalid status change');
check('B19', 'status history recorded (3 events)', val(await as('o1', `select count(*)::int from public.emergency_request_events where request_id=$1`, [rid])) === 3);
check('B20', 'closed request hidden from other volunteers', val(await as('v4', `select count(*)::int from public.emergency_requests`)) === 0);
err('B21', 'cannot respond to a closed request', await as('v1', `select public.respond_emergency_request($1,true)`, [rid]), 'closed or expired');
// rollback
let rb = { ok: true };
try { await db.exec(`begin;\n${readFileSync(join(root, 'proposals', 'wk12_location_emergency_rollback.sql'), 'utf8')}\ncommit;`) } catch (e) { rb = { ok: false, msg: e.message } }
check('R1', 'rollback removes all wk12 objects', rb.ok && val(await op(`select count(*)::int from pg_tables where schemaname='public' and tablename like 'emergency%'`)) === 0, rb);

const pass = results.filter((r) => r.pass).length;
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.desc}${r.detail ? ' :: ' + r.detail : ''}`);
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
