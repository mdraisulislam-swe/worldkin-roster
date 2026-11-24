import { freshDb } from './apply.mjs';
const { db, failed, error } = await freshDb(process.argv[2]);
if (failed) { console.log('MIGRATION FAILED', failed, error); process.exit(1); }

const results = [];
const uid = {};
// ---- execution helpers ------------------------------------------------------
async function run(role, sub, sql, params = []) {
  await db.exec('begin');
  try {
    if (role) {
      await db.exec(`set local role ${role}`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify(sub ? { sub, role } : { role })]);
    }
    const r = await db.query(sql, params);
    await db.exec('commit');
    return { ok: true, rows: r.rows, affected: r.affectedRows };
  } catch (e) {
    await db.exec('rollback');
    return { ok: false, msg: e.message, code: e.code };
  }
}
const as = (name, sql, p) => run('authenticated', uid[name], sql, p);
const anon = (sql, p) => run('anon', null, sql, p);
const op = (sql, p) => run(null, null, sql, p);           // operator / migration context (no JWT)
function check(id, desc, cond, detail) {
  results.push({ id, pass: !!cond, desc, detail: cond ? '' : JSON.stringify(detail ?? null).slice(0, 220) });
}
const expectErr = (id, desc, r, needle) =>
  check(id, desc, !r.ok && (String(r.msg).includes(needle) || r.code === needle), r);
const one = r => (r.ok ? r.rows[0] : null);
const val = r => { const row = one(r); return row ? Object.values(row)[0] : undefined; };
const K = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---- users (auth.users insert fires profile trigger) -------------------------
for (const n of ['admin', 'o1', 'c1', 'o2', 'v1', 'v2', 'v3', 'v4', 'v5', 'evil']) {
  const meta = n === 'evil' ? { full_name: 'Evil', platform_role: 'platform_admin' } : { full_name: n.toUpperCase() };
  const r = await op(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`,
    [`${n}@worldkin.test`, meta]);
  uid[n] = val(r);
}
check('SETUP', 'profiles auto-created for 10 users', val(await op(`select count(*)::int from public.profiles`)) === 10);
check('S3', 'metadata platform_role ignored at signup',
  val(await op(`select platform_role::text from public.profiles where id=$1`, [uid.evil])) === 'volunteer');

// ---- platform admin bootstrap (operator SQL) ---------------------------------
const boot = await op(`update public.profiles set platform_role='platform_admin' where id=$1`, [uid.admin]);
check('OPS1', 'operator can bootstrap first platform admin', boot.ok, boot);

// ---- role escalation ---------------------------------------------------------
expectErr('S2', 'volunteer cannot set own platform_role', await as('v1',
  `update public.profiles set platform_role='platform_admin' where id=auth.uid()`), 'permission denied');
const ownEdit = await as('v1', `update public.profiles set full_name='Volunteer One', skills='{first aid}' where id=auth.uid()`);
check('S2b', 'volunteer can edit own safe profile fields', ownEdit.ok && ownEdit.affected === 1, ownEdit);
const otherEdit = await as('v1', `update public.profiles set full_name='hacked' where id=$1`, [uid.v2]);
check('S2c', 'volunteer cannot edit another profile (0 rows)', otherEdit.ok && otherEdit.affected === 0, otherEdit);

// ---- organizations -----------------------------------------------------------
const org1 = val(await as('o1', `select public.create_organization('Relief One','relief-one','humanitarian','BD','desc',null)`));
const org2 = val(await as('o2', `select public.create_organization('Green Two','green-two','environment','KE',null,null)`));
check('ORG1', 'create_organization returns ids', org1 && org2);
expectErr('ORG2', 'duplicate slug rejected', await as('v1',
  `select public.create_organization('Xy Org','relief-one','other','BD',null,null)`), 'WK_SLUG_TAKEN');
expectErr('ORG3', 'invalid slug rejected', await as('v1',
  `select public.create_organization('Xy Org','Bad Slug!','other','BD',null,null)`), 'WK_INVALID_INPUT');
expectErr('S10', 'pending org cannot publish', await as('o1',
  `insert into public.opportunities (org_id,title,description,cause,country_code,status) values ($1,'Food drive','Pack food parcels','food_security','BD','published')`, [org1]), 'WK_ORG_NOT_VERIFIED');
expectErr('ORG4', 'non-admin cannot review org', await as('v1',
  `select public.review_organization($1,'verified',null)`, [org1]), 'WK_FORBIDDEN');
const adminOrg = val(await as('admin', `select public.create_organization('Admin Org','admin-org','other','BD',null,null)`));
expectErr('S14', 'platform admin cannot review own org', await as('admin',
  `select public.review_organization($1,'verified',null)`, [adminOrg]), 'WK_CONFLICT_OF_INTEREST');
check('ORG5', 'admin verifies org1 and org2',
  (await as('admin', `select public.review_organization($1,'verified',null)`, [org1])).ok &&
  (await as('admin', `select public.review_organization($1,'verified',null)`, [org2])).ok);
expectErr('ORG6', 'invalid org transition verified->rejected', await as('admin',
  `select public.review_organization($1,'rejected','x')`, [org1]), 'WK_INVALID_TRANSITION');
expectErr('ORG7', 'org admin cannot set org status directly', await as('o1',
  `update public.organizations set status='verified' where id=$1`, [org1]), 'permission denied');

// ---- membership --------------------------------------------------------------
const inv1 = one(await as('o1', `select public.invite_org_member($1,'c1@worldkin.test','coordinator') r`, [org1]))?.r;
check('MEM1', 'org admin invites coordinator (status invited)', inv1?.status === 'invited', inv1);
const accepted = one(await as('c1', `select public.accept_org_invite($1) r`, [inv1?.invite_id]))?.r;
check('MEM1b', 'invitee accepts -> coordinator', accepted?.role === 'coordinator' &&
  val(await op(`select role::text from public.org_members where org_id=$1 and user_id=$2`, [org1, uid.c1])) === 'coordinator', accepted);
const reinv = one(await as('o1', `select public.invite_org_member($1,'c1@worldkin.test','coordinator') r`, [org1]))?.r;
const reacc = one(await as('c1', `select public.accept_org_invite($1) r`, [reinv?.invite_id]))?.r;
check('MEM2', 're-invite of an existing member is harmless (already_member)', reacc?.already_member === true, reacc);
expectErr('MEM3', 'coordinator cannot invite members', await as('c1',
  `select public.invite_org_member($1,'v1@worldkin.test','coordinator')`, [org1]), 'WK_FORBIDDEN');
expectErr('S15', 'cannot remove last org admin', await as('o1',
  `select public.remove_org_member($1,$2)`, [org1, uid.o1]), 'WK_LAST_ADMIN');
const pendOrg = val(await as('v5', `select public.create_organization('Probe','probe-org','other','BD',null,null)`));
const probeHit = await as('v5', `select public.invite_org_member($1,'admin@worldkin.test','coordinator')`, [pendOrg]);
check('ENUM', 'unverified org cannot invite', !probeHit.ok && String(probeHit.msg).includes('WK_ORG_NOT_VERIFIED'), probeHit);
const regd = one(await as('o1', `select public.invite_org_member($1,'v2@worldkin.test','coordinator') r`, [org1]))?.r;
const ghost = one(await as('o1', `select public.invite_org_member($1,'nobody@worldkin.test','coordinator') r`, [org1]))?.r;
const shape = o => o && JSON.stringify(Object.keys(o).sort()) + o.status;
check('ENUM2', 'registered vs unregistered email: identical response shape/status',
  !!regd && !!ghost && shape(regd) === shape(ghost), [regd, ghost]);
check('ENUM3', 'invite does not create membership (no side channel)',
  val(await op(`select count(*)::int from public.org_members where org_id=$1 and user_id=$2`, [org1, uid.v2])) === 0);

// ---- opportunities & shifts --------------------------------------------------
const opp1 = val(await as('c1', `insert into public.opportunities (org_id,title,description,cause,country_code,city,skills_wanted)
  values ($1,'Food drive','Pack and deliver food parcels','food_security','BD','Dhaka','{logistics}') returning id`, [org1]));
check('OPP1', 'coordinator creates draft opportunity', !!opp1);
check('OPP2', 'publish after verification', (await as('c1', `update public.opportunities set status='published' where id=$1`, [opp1])).affected === 1);
const tStart = `now() + interval '2 days'`, tEnd = `now() + interval '2 days 3 hours'`;
const sh1 = val(await as('c1', `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity,waitlist_limit)
  values ($1,$2,${tStart},${tEnd},1,2) returning id`, [opp1, org1]));
check('SH1', 'coordinator creates shift (cap 1, waitlist 2)', !!sh1);
expectErr('SH2', 'shift in the past rejected (API)', await as('c1', `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity)
  values ($1,$2,now()-interval '1 hour',now(),1)`, [opp1, org1]), 'WK_SHIFT_IN_PAST');
expectErr('S5a', 'org2 cannot create shift in org1', await as('o2', `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity)
  values ($1,$2,${tStart},${tEnd},1)`, [opp1, org1]), 'row-level security');
expectErr('SH3', 'capacity column not directly updatable', await as('c1', `update public.shifts set capacity=99 where id=$1`, [sh1]), 'permission denied');

// ---- A05: join / duplicate / idempotency / full ------------------------------
const j1 = one(await as('v1', `select public.join_shift($1,$2) r`, [sh1, K(1)]))?.r;
check('C-JOIN', 'first volunteer confirmed', j1?.status === 'confirmed', j1);
const j1b = one(await as('v1', `select public.join_shift($1,$2) r`, [sh1, K(1)]))?.r;
check('C2', 'same idempotency key replays (no new row)', j1b?.replayed === true && j1b.signup_id === j1?.signup_id, j1b);
expectErr('C-DUP', 'duplicate join (new key) rejected', await as('v1', `select public.join_shift($1,$2)`, [sh1, K(2)]), 'WK_ALREADY_SIGNED_UP');
const j2 = one(await as('v2', `select public.join_shift($1,$2) r`, [sh1, K(3)]))?.r;
const j3 = one(await as('v3', `select public.join_shift($1,$2) r`, [sh1, K(4)]))?.r;
check('C1a', 'next two are waitlisted #1, #2', j2?.status === 'waitlisted' && j2.waitlist_position === 1 && j3?.waitlist_position === 2, [j2, j3]);
expectErr('C1b', 'shift + waitlist full', await as('v4', `select public.join_shift($1,$2)`, [sh1, K(5)]), 'WK_SHIFT_FULL');
check('C1c', 'confirmed never exceeds capacity', val(await op(`select count(*)::int from public.signups where shift_id=$1 and status='confirmed'`, [sh1])) === 1);
expectErr('S9', 'direct insert into signups denied', await as('v4', `insert into public.signups (shift_id,org_id,volunteer_id,status,slot,idempotency_key)
  values ($1,$2,auth.uid(),'confirmed',tstzrange(now(),now()+interval '1h'),$3)`, [sh1, org1, K(6)]), 'permission denied');

// ---- overlap -----------------------------------------------------------------
const opp2 = val(await as('o2', `insert into public.opportunities (org_id,title,description,cause,mode,status)
  values ($1,'Tree planting','Plant trees in the park','environment','remote','published') returning id`, [org2]));
const sh2 = val(await as('o2', `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity)
  values ($1,$2,now()+interval '2 days 1 hour',now()+interval '2 days 5 hours',5) returning id`, [opp2, org2]));
expectErr('C3', 'overlapping shift rejected (RPC)', await as('v1', `select public.join_shift($1,$2)`, [sh2, K(7)]), 'WK_SCHEDULE_CONFLICT');
expectErr('C3b', 'exclusion constraint blocks overlap even without RPC', await op(`insert into public.signups (shift_id,org_id,volunteer_id,status,slot,idempotency_key)
  values ($1,$2,$3,'confirmed',tstzrange(now()+interval '2 days 1 hour',now()+interval '2 days 5 hours','[)'),$4)`, [sh2, org2, uid.v1, K(8)]), 'signups_no_overlap');
expectErr('C-KEY', 'idempotency key reused on another shift', await as('v1', `select public.join_shift($1,$2)`, [sh2, K(1)]), 'WK_IDEMPOTENCY_KEY_REUSED');

// ---- cancellation & FIFO promotion -------------------------------------------
expectErr('S-CAN', 'volunteer cannot cancel someone else', await as('v4', `select public.cancel_signup($1,null)`, [j2?.signup_id]), 'WK_SIGNUP_NOT_FOUND');
const c1 = one(await as('v1', `select public.cancel_signup($1,null) r`, [j1?.signup_id]))?.r;
const st = async id => val(await op(`select status::text from public.signups where id=$1`, [id]));
check('C4', 'cancel promotes waitlist head (FIFO)', c1?.promoted_signup_ids?.[0] === j2?.signup_id && await st(j2?.signup_id) === 'confirmed' && await st(j3?.signup_id) === 'waitlisted', c1);
const c1b = one(await as('v1', `select public.cancel_signup($1,null) r`, [j1?.signup_id]))?.r;
check('C4b', 'repeat cancel is a no-op', c1b?.replayed === true, c1b);
const pos = one(await as('v3', `select public.join_shift($1,$2) r`, [sh1, K(4)]))?.r;
check('C4c', 'remaining waitlister moved to position 1', pos?.waitlist_position === 1, pos);
expectErr('C-STAFF', 'staff cancel requires reason', await as('c1', `select public.cancel_signup($1,null)`, [j2?.signup_id]), 'WK_REASON_REQUIRED');

// ---- capacity ---------------------------------------------------------------
const cap = one(await as('c1', `select public.update_shift_capacity($1,3) r`, [sh1]))?.r;
check('C7', 'capacity increase promotes waitlist', cap?.promoted_signup_ids?.[0] === j3?.signup_id && cap.confirmed === 2, cap);
expectErr('C6', 'capacity below confirmed rejected', await as('c1', `select public.update_shift_capacity($1,1)`, [sh1]), 'WK_CAPACITY_BELOW_CONFIRMED');
expectErr('S4a', 'other org cannot change capacity', await as('o2', `select public.update_shift_capacity($1,10)`, [sh1]), 'WK_SHIFT_NOT_FOUND');
expectErr('SH4', 'shift time frozen after signups', await as('c1', `update public.shifts set starts_at=starts_at+interval '1 hour' where id=$1`, [sh1]), 'WK_SHIFT_HAS_SIGNUPS');

// ---- isolation / exposure ----------------------------------------------------
check('S4b', 'org2 sees 0 signups of org1', val(await as('o2', `select count(*)::int from public.signups where org_id=$1`, [org1])) === 0);
const upd = await as('o2', `update public.shifts set title='x' where id=$1`, [sh1]);
check('S5b', 'org2 update of org1 shift affects 0 rows', upd.ok && upd.affected === 0, upd);
expectErr('S4c', 'org2 cannot read org1 roster', await as('o2', `select * from public.get_shift_roster($1)`, [sh1]), 'WK_SHIFT_NOT_FOUND');
check('S11', 'volunteer sees only own signups', val(await as('v2', `select count(*)::int from public.signups`)) === 1);
check('S11b', 'volunteer cannot read unrelated profiles', val(await as('v2', `select count(*)::int from public.profiles`)) === 1);
expectErr('S1a', 'anon cannot read signups', await anon(`select * from public.signups`), 'permission denied');
expectErr('S1b', 'anon cannot read profiles', await anon(`select * from public.profiles`), 'permission denied');
check('S1c', 'anon sees published opportunities only', val(await anon(`select count(*)::int from public.opportunities`)) === 2);
const roster = await as('c1', `select * from public.get_shift_roster($1)`, [sh1]);
check('S8r', 'roster exposes no email/location columns', roster.ok && roster.rows.length > 0 && !('email' in roster.rows[0]) && !('city' in roster.rows[0]), roster);
expectErr('S12', 'internal _promote_waitlist not callable', await as('v1', `select public._promote_waitlist($1)`, [sh1]), 'permission denied');

// ---- sensitive ---------------------------------------------------------------
await as('c1', `update public.opportunities set is_sensitive=true where id=$1`, [opp1]);
check('S13a', 'anon cannot see sensitive opportunity', val(await anon(`select count(*)::int from public.opportunities where id=$1`, [opp1])) === 0);
check('S13b', 'anon search hides sensitive', !(await anon(`select id from public.search_opportunities()`)).rows?.some(r => r.id === opp1));
check('S13c', 'signed-in user can see sensitive', val(await as('v4', `select count(*)::int from public.opportunities where id=$1`, [opp1])) === 1);
await as('c1', `update public.opportunities set is_sensitive=false where id=$1`, [opp1]);

// ---- skill eligibility ------------------------------------------------------
await as('c1', `update public.opportunities set requires_skill_match=true where id=$1`, [opp1]);
expectErr('C11a', 'no matching skill -> not eligible', await as('v4', `select public.join_shift($1,$2)`, [sh1, K(9)]), 'WK_NOT_ELIGIBLE');
await as('v4', `update public.profiles set skills='{LOGISTICS}' where id=auth.uid()`);
const c11b = await as('v4', `select public.join_shift($1,$2)`, [sh1, K(10)]);
check('C11b', 'matching skill (case-insensitive) -> joins', c11b.ok, c11b);
await as('c1', `update public.opportunities set requires_skill_match=false where id=$1`, [opp1]);
expectErr('C11c', 'skill match cannot be required without listed skills', await as('c1',
  `update public.opportunities set requires_skill_match=true, skills_wanted='{}' where id=$1`, [opp1]), 'opportunities_skill_match_needs_skills');
expectErr('C11d', 'eligibility notes length limited (1000)', await as('c1',
  `update public.opportunities set requirements=repeat('x',1001) where id=$1`, [opp1]), 'check constraint');

// ---- waitlist disabled -------------------------------------------------------
const sh0 = val(await as('c1', `insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity,waitlist_limit)
  values ($1,$2,now()+interval '5 days',now()+interval '5 days 2 hours',1,0) returning id`, [opp1, org1]));
check('WL0a', 'waitlist_limit 0: first joiner confirmed', one(await as('v4', `select public.join_shift($1,$2) r`, [sh0, K(40)]))?.r?.status === 'confirmed');
expectErr('WL0b', 'waitlist_limit 0: second joiner rejected, not waitlisted', await as('v2', `select public.join_shift($1,$2)`, [sh0, K(41)]), 'WK_SHIFT_FULL');

// ---- attendance --------------------------------------------------------------
const past = await op(`insert into public.shifts (opportunity_id,org_id,starts_at,ends_at,capacity,created_by)
  values ($1,$2,now()-interval '3 hours',now()-interval '1 hour',5,$3) returning id`, [opp1, org1, uid.c1]);
check('OPS2', 'operator can seed a PAST shift (demo history)', past.ok, past);
const pastShift = val(past);
if (pastShift) {
  const mk = async (n, k) => val(await op(`insert into public.signups (shift_id,org_id,volunteer_id,status,slot,idempotency_key)
    values ($1,$2,$3,'confirmed',tstzrange(now()-interval '3 hours',now()-interval '1 hour','[)'),$4) returning id`, [pastShift, org1, uid[n], K(k)]));
  const sv5 = await mk('v5', 20), sc1 = await mk('c1', 21), sv2 = await mk('v3', 22);
  expectErr('S6', 'coordinator cannot verify own attendance', await as('c1', `select public.record_attendance($1,true,null,null)`, [sc1]), 'WK_SELF_VERIFICATION');
  expectErr('C8', 'hours above duration rejected', await as('c1', `select public.record_attendance($1,true,5,null)`, [sv5]), 'WK_INVALID_HOURS');
  check('C8b', 'rollback: signup still confirmed after failed attendance', await st(sv5) === 'confirmed');
  const att1 = await as('c1', `select public.record_attendance($1,true,1.5,'great')`, [sv5]);
  check('ATT1', 'attendance recorded (1.5h)', att1.ok, att1);
  expectErr('ATT2', 'attendance only once', await as('c1', `select public.record_attendance($1,false,null,null)`, [sv5]), 'WK_ALREADY_RECORDED');
  expectErr('ATT3', 'other org cannot record attendance', await as('o2', `select public.record_attendance($1,true,null,null)`, [sv2]), 'WK_SIGNUP_NOT_FOUND');
  const att4 = await as('o1', `select public.record_attendance($1,false,null,null)`, [sv2]);
  check('ATT4', 'no-show recorded', att4.ok, att4);
  expectErr('S7a', 'API cannot update participation', await as('o1', `update public.participation_records set hours=20`), 'permission denied');
  expectErr('S7b', 'even operator cannot update participation', await op(`update public.participation_records set hours=20`), 'WK_APPEND_ONLY');
  expectErr('S6b', 'CHECK blocks self-verification at table level', await op(`insert into public.participation_records (signup_id,shift_id,org_id,volunteer_id,hours,verified_by)
    values ($1,$2,$3,$4,1,$4)`, [sc1, pastShift, org1, uid.c1]), 'participation_no_self_verification');
  const imp = one(await as('v5', `select public.my_impact() r`))?.r;
  check('M05a', 'my_impact verified hours = 1.5', Number(imp?.verified_hours) === 1.5, imp);
  const dash = one(await as('o1', `select public.org_dashboard($1) r`, [org1]))?.r;
  check('M05b', 'dashboard: attended 1, no_show 1, no-show 50%, hours 1.5',
    dash?.attended === 1 && dash.no_show === 1 && Number(dash.no_show_rate_pct) === 50 && Number(dash.verified_hours) === 1.5, dash);
}
expectErr('ATT5', 'attendance before shift starts rejected', await as('c1', `select public.record_attendance($1,true,null,null)`, [j2?.signup_id]), 'WK_SHIFT_NOT_STARTED');

// ---- audit -------------------------------------------------------------------
expectErr('S8a', 'API cannot delete audit logs', await as('admin', `delete from public.audit_logs`), 'permission denied');
expectErr('S8b', 'operator cannot delete audit logs', await op(`delete from public.audit_logs`), 'WK_APPEND_ONLY');
expectErr('S8c', 'operator cannot truncate audit logs', await op(`truncate public.audit_logs`), 'WK_APPEND_ONLY');
check('S16a', 'signup changes audited with actor', val(await op(`select count(*)::int from public.audit_logs where entity_type='signups' and actor_id is not null`)) > 5);
check('S16b', 'role bootstrap audited', val(await op(`select count(*)::int from public.audit_logs where entity_type='profiles' and entity_id=$1`, [uid.admin])) === 1);
check('S16c', 'coordinator cannot read audit log', val(await as('c1', `select count(*)::int from public.audit_logs`)) === 0);
check('S16d', 'org admin reads only own org audit', val(await as('o1', `select count(*)::int from public.audit_logs where org_id<>$1`, [org1])) === 0 &&
  val(await as('o1', `select count(*)::int from public.audit_logs`)) > 0);

// ---- lifecycle & search -------------------------------------------------------
const lc0 = await as('c1', `update public.opportunities set status='closed' where id=$1`, [opp2]);
check('LC0', 'coordinator of org1 cannot close org2 opportunity (0 rows)', lc0.ok && lc0.affected === 0, lc0);
await as('o2', `update public.opportunities set status='closed' where id=$1`, [opp2]);
expectErr('LC2', 'closed -> published rejected', await as('o2', `update public.opportunities set status='published' where id=$1`, [opp2]), 'WK_INVALID_TRANSITION');
expectErr('C10', 'join on closed opportunity rejected', await as('v5', `select public.join_shift($1,$2)`, [sh2, K(30)]), 'WK_SHIFT_NOT_OPEN');
const s1 = await anon(`select * from public.search_opportunities(p_query => $1)`, [`food & | !( "`]);
check('M05c', 'search tolerates malformed query', s1.ok, s1);
const s2 = await anon(`select title, total_count, open_spots from public.search_opportunities(p_query => 'food', p_sort => 'most_open')`);
check('M05d', 'search finds by text with counts', s2.ok && s2.rows[0]?.title === 'Food drive' && Number(s2.rows[0].total_count) === 1, s2);
const av = await anon(`select * from public.shift_availability($1)`, [opp1]);
check('M05e', 'availability returns counts to anon', av.ok && av.rows.length >= 1, av);

// ---- suspension ---------------------------------------------------------------
check('SUS1', 'suspend verified org with reason', (await as('admin', `select public.review_organization($1,'suspended','fraud report')`, [org1])).ok);
check('SUS2', 'suspended org content hidden from public', val(await anon(`select count(*)::int from public.opportunities where org_id=$1`, [org1])) === 0);
expectErr('SUS3', 'cannot join shift of suspended org', await as('v5', `select public.join_shift($1,$2)`, [sh1, K(31)]), 'WK_SHIFT_NOT_OPEN');

// ---- account deletion ---------------------------------------------------------
const del = await op(`delete from auth.users where id=$1`, [uid.v5]);
check('DEL1', 'deleting a user WITH history is blocked (history preserved)', !del.ok, del);
const del2 = await op(`delete from auth.users where id=$1`, [uid.evil]);
check('DEL2', 'deleting a user without history succeeds', del2.ok, del2);

// ---- report -------------------------------------------------------------------
const pass = results.filter(r => r.pass).length;
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(7)} ${r.desc}${r.detail ? '\n        -> ' + r.detail : ''}`);
console.log(`\n${pass}/${results.length} passed`);
