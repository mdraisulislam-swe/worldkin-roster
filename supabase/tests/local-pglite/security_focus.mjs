// Focused attack tests for (1) user enumeration and (2) _is_api_request bypass.
// Usage: node focus.mjs <migrationsDir> [label]
import { freshDb } from './apply.mjs';
import { performance } from 'node:perf_hooks';
const { db, failed, error } = await freshDb(process.argv[2]);
if (failed) { console.log('MIGRATION FAILED', failed, error); process.exit(1); }
const label = process.argv[3] ?? '';

// PostgREST-faithful session: login role "authenticator", then SET ROLE + claims per request.
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then
      create role authenticator login noinherit;
    end if;
  end $$;
  grant anon, authenticated, service_role to authenticator;
  alter table auth.users add column if not exists email_confirmed_at timestamptz;
`);
const uid = {};
const out = [];
const rec = (id, desc, r) => out.push({ id, desc, ok: r.ok, code: r.code ?? null, msg: r.ok ? JSON.stringify(r.rows?.[0] ?? null).slice(0, 110) : r.msg });

async function api(sub, sql, params = [], { role = 'authenticated', tamper = null } = {}) {
  await db.exec('begin');
  try {
    await db.exec(`set local session authorization authenticator`);
    await db.exec(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    if (tamper) await db.exec(tamper);          // worst case: attacker-controlled SQL (impossible via PostgREST)
    const r = await db.query(sql, params);
    await db.exec('commit');
    return { ok: true, rows: r.rows, affected: r.affectedRows };
  } catch (e) { await db.exec('rollback'); return { ok: false, msg: e.message, code: e.code }; }
}
async function op(sql, params = []) {
  await db.exec('set session authorization postgres; reset role');
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, affected: r.affectedRows }; }
  catch (e) { return { ok: false, msg: e.message, code: e.code }; }
}
const val = r => (r.ok && r.rows[0] ? Object.values(r.rows[0])[0] : undefined);

for (const n of ['admin', 'oa', 'coord', 'outsider', 'target', 'probe']) {
  uid[n] = val(await op(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [`${n}@worldkin.test`]));
}
await op(`update public.profiles set platform_role='platform_admin' where id=$1`, [uid.admin]);
const org = val(await api(uid.oa, `select public.create_organization('Relief One','relief-one','humanitarian','BD',null,null)`));
await api(uid.admin, `select public.review_organization($1,'verified',null)`, [org]);
await op(`insert into public.org_members (org_id,user_id,role) values ($1,$2,'coordinator')`, [org, uid.coord]);
const pend = val(await api(uid.probe, `select public.create_organization('Probe','probe-org','other','BD',null,null)`));
const hasInvite = (await op(`select 1 from pg_proc where proname='invite_org_member'`)).rows.length > 0;
const addFn = hasInvite ? 'invite_org_member' : 'add_org_member';

// ===================== ISSUE 1: user enumeration =============================
const call = (who, o, email) => api(uid[who], `select public.${addFn}($1,$2,'coordinator') r`, [o, email]);
rec('E1', `${addFn}: verified-org ADMIN, registered email`, await call('oa', org, 'target@worldkin.test'));
rec('E2', `${addFn}: verified-org ADMIN, unregistered email`, await call('oa', org, 'ghost@worldkin.test'));
rec('E3a', `${addFn}: COORDINATOR, registered email`, await call('coord', org, 'outsider@worldkin.test'));
rec('E3b', `${addFn}: COORDINATOR, unregistered email`, await call('coord', org, 'ghost2@worldkin.test'));
rec('E4a', `${addFn}: NON-MEMBER, registered email`, await call('outsider', org, 'admin@worldkin.test'));
rec('E4b', `${addFn}: NON-MEMBER, unregistered email`, await call('outsider', org, 'ghost3@worldkin.test'));
rec('E5a', `${addFn}: PENDING-org admin, registered email`, await call('probe', pend, 'admin@worldkin.test'));
rec('E5b', `${addFn}: PENDING-org admin, unregistered email`, await call('probe', pend, 'ghost4@worldkin.test'));
// side channel: does the admin's member list change for a registered email?
rec('E6', 'org_members visible to admin after E1/E2 (count)', await api(uid.oa, `select count(*)::int n from public.org_members where org_id=$1`, [org]));
// timing (local, indicative only)
// separate verified org so the 50-open-invite limit of `org` is not consumed
uid.oa2 = val(await op(`insert into auth.users (email, email_confirmed_at) values ('oa2@worldkin.test', now()) returning id`));
const orgT = val(await api(uid.oa2, `select public.create_organization('Timing Org','timing-org','other','BD',null,null)`));
await api(uid.admin, `select public.review_organization($1,'verified',null)`, [orgT]);
async function timeIt(email, n = 20) {
  const t = [];
  for (let i = 0; i < n; i++) { const s = performance.now(); await call('oa2', orgT, email.replace('@', `+${i}@`)); t.push(performance.now() - s); }
  t.sort((a, b) => a - b); return t[Math.floor(n / 2)].toFixed(2);
}
const regs = [];
for (let i = 0; i < 25; i++) regs.push(val(await op(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [`reg+${i}@worldkin.test`])));
out.push({ id: 'E7', desc: 'median ms: registered vs unregistered (20 each, local PGlite)', ok: true,
  msg: `registered=${await timeIt('reg@worldkin.test')}ms unregistered=${await timeIt('nobody@worldkin.test')}ms` });

if (hasInvite) {
  const inv = (await api(uid.oa, `select public.invite_org_member($1,'target@worldkin.test','coordinator') r`, [org]));
  rec('I0', 'duplicate open invite (same org, same email)', inv);
  const mine = await api(uid.target, `select * from public.my_org_invites()`);
  rec('I1', 'invitee sees own pending invite', mine);
  const invId = mine.rows?.[0]?.invite_id;
  rec('I2', 'OTHER user cannot accept the invite', await api(uid.outsider, `select public.accept_org_invite($1) r`, [invId]));
  rec('I3', 'invitee accepts -> becomes member', await api(uid.target, `select public.accept_org_invite($1) r`, [invId]));
  rec('I4', 'accept again is a no-op', await api(uid.target, `select public.accept_org_invite($1) r`, [invId]));
  rec('I5', 'target is now coordinator of org', await op(`select role::text from public.org_members where org_id=$1 and user_id=$2`, [org, uid.target]));
  const unconf = val(await op(`insert into auth.users (email) values ('unconf@worldkin.test') returning id`));
  await api(uid.oa, `select public.invite_org_member($1,'unconf@worldkin.test','coordinator')`, [org]);
  rec('I6', 'UNCONFIRMED email cannot see/accept invites', await api(unconf, `select count(*)::int n from public.my_org_invites()`));
  rec('I7', 'coordinator cannot list invites (RLS)', await api(uid.coord, `select count(*)::int n from public.org_invites`));
  rec('I8', 'admin can list own org invites', await api(uid.oa, `select count(*)::int n from public.org_invites`));
  rec('I9', 'API cannot insert invites directly', await api(uid.oa, `insert into public.org_invites (org_id,email,role,invited_by) values ($1,'x@y.z','org_admin',$2)`, [org, uid.oa]));
  const r2 = (await api(uid.oa, `select public.invite_org_member($1,'later@worldkin.test','org_admin') r`, [org]));
  const lid = r2.rows?.[0]?.r?.invite_id;
  rec('I10', 'admin revokes an invite', await api(uid.oa, `select public.revoke_org_invite($1) r`, [lid]));
  const later = val(await op(`insert into auth.users (email, email_confirmed_at) values ('later@worldkin.test', now()) returning id`));
  rec('I11', 'revoked invite cannot be accepted', await api(later, `select public.accept_org_invite($1) r`, [lid]));
  rec('I12', 'invalid email rejected', await api(uid.oa, `select public.invite_org_member($1,'not-an-email','coordinator')`, [org]));
}

// ===================== ISSUE 2: _is_api_request bypass ========================
const opp = val(await api(uid.oa, `insert into public.opportunities (org_id,title,description,cause,country_code,status)
  values ($1,'Food drive','Pack food parcels','food_security','BD','published') returning id`, [org]));
const fut = val(await api(uid.oa, `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity)
  values ($1,$2,now()+interval '1 day',now()+interval '1 day 2 hours',3) returning id`, [opp, org]));
const pastIns = `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity)
  values ($1,$2,now()-interval '3 hours',now()-interval '1 hour',3) returning id`;
rec('P1', 'API authenticated: insert PAST shift', await api(uid.oa, pastIns, [opp, org]));
rec('P2', 'API authenticated: move future shift into the past', await api(uid.oa, `update public.shifts set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour' where id=$1`, [fut]));
rec('P3', 'API anon: insert past shift', await api(null, pastIns, [opp, org], { role: 'anon' }));
rec('P4', 'API service_role key: insert past shift', await api(null, pastIns, [opp, org], { role: 'service_role' }));
rec('P5', 'API authenticated: call _is_api_request() directly', await api(uid.oa, `select public._is_api_request()`));
rec('P6', 'API authenticated: RPCs that write shifts cannot change times (capacity on future shift)', await api(uid.oa, `select public.update_shift_capacity($1,5) r`, [fut]));
// Worst-case tampering: attacker could run SQL inside the API session (NOT possible through PostgREST)
rec('T1', 'TAMPER set_config(claims, empty) then insert past', await api(uid.oa, pastIns, [opp, org], { tamper: `select set_config('request.jwt.claims','',true)` }));
rec('T2', 'TAMPER reset claims then insert past', await api(uid.oa, pastIns, [opp, org], { tamper: `reset request.jwt.claims` }));
rec('T3', 'TAMPER set local claims to {} then insert past', await api(uid.oa, pastIns, [opp, org], { tamper: `set local request.jwt.claims = '{}'` }));
rec('T4', 'TAMPER clear claims but keep identity via legacy request.jwt.claim.sub, insert past', await api(uid.oa, pastIns, [opp, org], { tamper: `select set_config('request.jwt.claims','',true); select set_config('request.jwt.claim.sub','${uid.oa}',true)` }));
rec('O1', 'OPERATOR (postgres session, no claims): insert past shift', await op(pastIns.replace('capacity)', 'capacity,created_by)').replace(',3)', `,3,'${uid.oa}')`), [opp, org]));
rec('O2', 'session/current user in operator path', await op(`select session_user::text s, current_user::text c, public._is_api_request() api`));

console.log(`\n==== ${label} ====`);
for (const r of out) console.log(`${r.id.padEnd(4)} ${r.ok ? 'OK   ' : 'ERROR'} ${r.desc}\n       ${r.ok ? r.msg : `[${r.code}] ${r.msg}`}`);
