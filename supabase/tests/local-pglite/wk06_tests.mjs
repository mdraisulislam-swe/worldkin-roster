// Local tests for migration wk06 (applications, offers, complaints, feedback,
// notifications, moderation, statistics) on PostgreSQL 17 (PGlite).
// Usage: node wk06_tests.mjs <migrations dir>
import { freshDb } from './apply.mjs';
const { db, failed, error } = await freshDb(process.argv[2]);
if (failed) { console.log('MIGRATION FAILED', failed, error); process.exit(1); }

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
  } catch (e) {
    await db.exec('rollback');
    return { ok: false, msg: e.message, code: e.code };
  }
}
const as = (name, sql, p) => run('authenticated', uid[name], sql, p);
const anon = (sql, p) => run('anon', null, sql, p);
const op = (sql, p) => run(null, null, sql, p);
const check = (id, desc, cond, detail) => results.push({ id, pass: !!cond, desc, detail: cond ? '' : JSON.stringify(detail ?? null).slice(0, 260) });
const expectErr = (id, desc, r, needle) => check(id, desc, !r.ok && (String(r.msg).includes(needle) || r.code === needle), r);
const one = r => (r.ok ? r.rows[0] : null);
const val = r => { const row = one(r); return row ? Object.values(row)[0] : undefined; };
const K = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

for (const n of ['admin', 'o1', 'c1', 'o2', 'v1', 'v2', 'v3', 'v4']) {
  uid[n] = val(await op(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`,
    [`${n}@worldkin.test`, { full_name: `${n.toUpperCase()} Tester` }]));
}
await op(`update public.profiles set platform_role = 'platform_admin' where id = $1`, [uid.admin]);
await op(`update public.profiles set skills = '{first aid}' where id in ($1, $2, $3, $4)`, [uid.v1, uid.v2, uid.v3, uid.v4]);

// ---- organizations ------------------------------------------------------------
const orgA = val(await as('o1', `select public.create_organization('Org A', 'org-a', 'health', 'BD', 'Desc A', null, 'ngo', 'Dhaka',
  '+880 1700 000000', 'info@orga.test', 'Road 1, Dhaka', 'REG-1', 'Rep One', 'Director')`));
check('ORG1', 'extended create_organization returns an id', !!orgA);
const priv = one(await op(`select * from public.organization_private where org_id = $1`, [orgA]));
check('ORG2', 'private verification data stored separately', priv?.registration_id === 'REG-1' && priv?.address === 'Road 1, Dhaka', priv);
check('ORG3', 'platform admins notified about the pending organization',
  val(await op(`select count(*)::int from public.notifications where user_id = $1 and kind = 'org_pending'`, [uid.admin])) === 1);
const orgB = val(await as('o2', `select public.create_organization('Org B', 'org-b', 'education', 'IN')`));
await as('admin', `select public.review_organization($1, 'verified', null)`, [orgA]);
await as('admin', `select public.review_organization($1, 'verified', null)`, [orgB]);
check('ORG4', 'org admins notified of verification',
  val(await op(`select count(*)::int from public.notifications where user_id = $1 and kind = 'org_status'`, [uid.o1])) === 1);
await op(`insert into public.org_members (org_id, user_id, role) values ($1, $2, 'coordinator')`, [orgA, uid.c1]);
check('PRIV1', 'other organization cannot read Org A private data',
  (await as('o2', `select count(*)::int n from public.organization_private where org_id = $1`, [orgA])).rows?.[0]?.n === 0);
check('PRIV2', 'coordinator of Org A can read it',
  (await as('c1', `select count(*)::int n from public.organization_private where org_id = $1`, [orgA])).rows?.[0]?.n === 1);
const cUpd = await as('c1', `update public.organization_private set registration_id = 'X' where org_id = $1`, [orgA]);
check('PRIV3', 'coordinator cannot change verification data (org admin only)', cUpd.ok && cUpd.affected === 0, cUpd);

// ---- opportunities ------------------------------------------------------------
const insOpp = (who, title, extra) => as(who, `insert into public.opportunities (org_id, title, description, cause, mode, country_code, status,
  skills_wanted, requires_skill_match, compensation_type, compensation_details, selection_mode, application_deadline)
  values ($1, $2, 'A long enough description', 'health', 'onsite', 'BD', 'published', '{first aid}', $3, $4, $5, $6, $7) returning id`,
  [orgA, title, ...extra]);
expectErr('OPP1', 'paid opportunity without compensation details is rejected',
  await insOpp('o1', 'Paid no details', [false, 'paid', null, 'open', null]), 'opportunities_compensation_details_required');
expectErr('OPP2', 'deadline is only allowed for application opportunities',
  await insOpp('o1', 'Open with deadline', [false, 'voluntary', null, 'open', new Date(Date.now() + 86400e3).toISOString()]), 'opportunities_deadline_needs_application');
const oppApp = val(await insOpp('o1', 'Stipend role', [true, 'stipend', 'USD 20 per day for meals', 'application', new Date(Date.now() + 5 * 86400e3).toISOString()]));
const oppOpen = val(await insOpp('o1', 'Open drive', [false, 'voluntary', null, 'open', null]));
check('OPP3', 'stipend application opportunity and open opportunity created', !!oppApp && !!oppOpen);
const shift = (opp, h, cap = 1) => as('o1', `insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity)
  values ($1, $2, 'S', now() + make_interval(hours => $3), now() + make_interval(hours => $3 + 2), $4) returning id`, [opp, orgA, h, cap]);
const S1 = val(await shift(oppApp, 100)), S2 = val(await shift(oppApp, 200)), S3 = val(await shift(oppOpen, 300));
check('OPP4', 'shifts created', !!S1 && !!S2 && !!S3);

// ---- applications -------------------------------------------------------------
expectErr('AP1', 'direct join on an application opportunity is refused', await as('v1', `select public.join_shift($1, $2)`, [S1, K(1)]), 'WK_APPLICATION_REQUIRED');
const ap = await as('v1', `select public.apply_to_opportunity($1, 'I am a trained first aider') r`, [oppApp]);
const app1 = ap.rows?.[0]?.r?.application_id;
check('AP2', 'volunteer applies → submitted', ap.ok && ap.rows[0].r.status === 'submitted', ap);
const ap2 = await as('v1', `select public.apply_to_opportunity($1, 'again') r`, [oppApp]);
check('AP3', 'retry returns the same application (no duplicate)', ap2.ok && ap2.rows[0].r.replayed === true && ap2.rows[0].r.application_id === app1, ap2);
check('AP4', 'exactly one active application row',
  val(await op(`select count(*)::int from public.applications where volunteer_id = $1 and opportunity_id = $2`, [uid.v1, oppApp])) === 1);
expectErr('AP5', 'org staff cannot apply to their own organization', await as('c1', `select public.apply_to_opportunity($1)`, [oppApp]), 'WK_CONFLICT_OF_INTEREST');
expectErr('AP6', 'open opportunity does not take applications', await as('v1', `select public.apply_to_opportunity($1)`, [oppOpen]), 'WK_APPLICATION_NOT_REQUIRED');
await op(`update public.opportunities set application_deadline = now() - interval '1 minute' where id = $1`, [oppApp]);
expectErr('AP7', 'application after the deadline is refused', await as('v4', `select public.apply_to_opportunity($1)`, [oppApp]), 'WK_APPLICATION_DEADLINE_PASSED');
await op(`update public.opportunities set application_deadline = now() + interval '5 days' where id = $1`, [oppApp]);
check('AP8', 'organization admins notified of the application',
  val(await op(`select count(*)::int from public.notifications where user_id = $1 and kind = 'application_new'`, [uid.o1])) === 1);
expectErr('AP9', 'selection mode cannot change after applications exist',
  await as('o1', `update public.opportunities set selection_mode = 'open', application_deadline = null where id = $1`, [oppApp]), 'WK_IMMUTABLE_FIELD');

// ---- privacy ------------------------------------------------------------------
expectErr('P1', 'another organization cannot list Org A applicants', await as('o2', `select * from public.org_applications($1)`, [orgA]), 'WK_FORBIDDEN');
check('P2', 'another organization sees no Org A application rows',
  (await as('o2', `select count(*)::int n from public.applications`)).rows?.[0]?.n === 0);
check('P3', 'another volunteer sees no one else’s applications',
  (await as('v2', `select count(*)::int n from public.applications`)).rows?.[0]?.n === 0);
expectErr('P4', 'anonymous cannot read applications', await anon(`select * from public.applications`), 'permission denied');
await as('v1', `insert into public.profile_private (phone) values ('+880 1711 111111')`);
check('P5', 'volunteer reads own phone', (await as('v1', `select phone from public.profile_private`)).rows?.[0]?.phone === '+880 1711 111111');
check('P6', 'organization staff cannot read applicant phone',
  (await as('o1', `select count(*)::int n from public.profile_private`)).rows?.[0]?.n === 0);
const list = await as('c1', `select * from public.org_applications($1)`, [orgA]);
const cols = list.ok ? Object.keys(list.rows[0] ?? {}) : [];
check('P7', 'coordinator lists applicants without phone/email/address',
  list.ok && list.rows.length === 1 && !cols.some(c => /phone|email|address/.test(c)), list);
await as('o1', `select public.review_application($1, 'note', null, 'Strong candidate')`, [app1]);
check('P8', 'private review note invisible to the volunteer',
  (await as('v1', `select count(*)::int n from public.application_notes`)).rows?.[0]?.n === 0 &&
  (await as('o1', `select note from public.application_notes`)).rows?.[0]?.note === 'Strong candidate');

// ---- review and offers --------------------------------------------------------
await as('o1', `select public.review_application($1, 'under_review')`, [app1]);
check('R1', 'application moved under review', val(await op(`select status::text from public.applications where id = $1`, [app1])) === 'under_review');
expectErr('R2', 'invalid transition is refused', await as('o1', `select public.review_application($1, 'under_review')`, [app1]), 'WK_INVALID_STATE');
expectErr('O1', 'offer for a shift of another opportunity is refused', await as('o1', `select public.send_offer($1, $2)`, [app1, S3]), 'WK_SHIFT_MISMATCH');
const off = await as('o1', `select public.send_offer($1, $2, 'Welcome aboard') r`, [app1, S1]);
const offer1 = off.rows?.[0]?.r?.offer_id;
check('O2', 'offer sent; application selected', off.ok && val(await op(`select status::text from public.applications where id = $1`, [app1])) === 'selected', off);
check('O3', 'expiry set by the server to at most 72 hours',
  val(await op(`select (expires_at <= now() + interval '72 hours' and expires_at > now() + interval '71 hours')::text from public.offers where id = $1`, [offer1])) === 'true');
expectErr('O4', 'second simultaneous offer refused', await as('o1', `select public.send_offer($1, $2)`, [app1, S2]), 'WK_OFFER_EXISTS');
expectErr('O5', 'another volunteer cannot accept the offer', await as('v2', `select public.accept_offer($1, $2)`, [offer1, K(2)]), 'WK_OFFER_NOT_FOUND');
expectErr('O6', 'organization cannot accept on behalf of the volunteer', await as('o1', `select public.accept_offer($1, $2)`, [offer1, K(3)]), 'WK_OFFER_NOT_FOUND');
const acc = await as('v1', `select public.accept_offer($1, $2) r`, [offer1, K(4)]);
check('O7', 'acceptance books through the booking core → confirmed', acc.ok && acc.rows[0].r.status === 'confirmed', acc);
const acc2 = await as('v1', `select public.accept_offer($1, $2) r`, [offer1, K(4)]);
check('O8', 'retrying acceptance is idempotent (replayed, one signup)', acc2.ok && acc2.rows[0].r.replayed === true &&
  val(await op(`select count(*)::int from public.signups where volunteer_id = $1 and shift_id = $2`, [uid.v1, S1])) === 1, acc2);
check('O9', 'offer linked to the signup of the right volunteer and shift',
  val(await op(`select (g.volunteer_id = $2 and g.shift_id = $3)::text from public.offers o join public.signups g on g.id = o.signup_id where o.id = $1`,
    [offer1, uid.v1, S1])) === 'true');
expectErr('O10', 'withdrawal after acceptance is refused', await as('v1', `select public.withdraw_application($1)`, [app1]), 'WK_INVALID_STATE');

// Full shift → acceptance is waitlisted, never overbooked.
const app2 = (await as('v2', `select public.apply_to_opportunity($1) r`, [oppApp])).rows[0].r.application_id;
const offer2 = (await as('o1', `select public.send_offer($1, $2) r`, [app2, S1])).rows[0].r.offer_id;
const acc3 = await as('v2', `select public.accept_offer($1, $2) r`, [offer2, K(5)]);
check('W1', 'accepting an offer for a full shift → waitlisted #1', acc3.ok && acc3.rows[0].r.status === 'waitlisted' && acc3.rows[0].r.waitlist_position === 1, acc3);
check('W2', 'capacity never exceeded', val(await op(`select count(*)::int from public.signups where shift_id = $1 and status = 'confirmed'`, [S1])) === 1);

// Expired offer.
const app3 = (await as('v3', `select public.apply_to_opportunity($1) r`, [oppApp])).rows[0].r.application_id;
const offer3 = (await as('o1', `select public.send_offer($1, $2) r`, [app3, S2])).rows[0].r.offer_id;
await op(`update public.offers set created_at = now() - interval '4 days', expires_at = now() - interval '1 hour' where id = $1`, [offer3]);
expectErr('E1', 'expired offer can never be accepted', await as('v3', `select public.accept_offer($1, $2)`, [offer3, K(6)]), 'WK_OFFER_EXPIRED');
const mine = await as('v3', `select status::text s, offer_status::text os from public.my_applications()`);
check('E2', 'reading lists marks the offer and application expired (server-side)', mine.ok && mine.rows[0]?.s === 'expired' && mine.rows[0]?.os === 'expired', mine);
check('E3', 'no seat was taken by the expired offer', val(await op(`select count(*)::int from public.signups where volunteer_id = $1`, [uid.v3])) === 0);

// Revoked, declined, rejected, withdrawn.
const app4 = (await as('v4', `select public.apply_to_opportunity($1) r`, [oppApp])).rows[0].r.application_id;
const offer4 = (await as('o1', `select public.send_offer($1, $2) r`, [app4, S2])).rows[0].r.offer_id;
await as('o1', `select public.revoke_offer($1, 'Shift merged')`, [offer4]);
expectErr('X1', 'revoked offer can never be accepted', await as('v4', `select public.accept_offer($1, $2)`, [offer4, K(7)]), 'WK_OFFER_REVOKED');
check('X2', 'application returns to under review after revoke', val(await op(`select status::text from public.applications where id = $1`, [app4])) === 'under_review');
const offer5 = (await as('o1', `select public.send_offer($1, $2) r`, [app4, S2])).rows[0].r.offer_id;
await as('v4', `select public.decline_offer($1)`, [offer5]);
check('X3', 'decline → application declined', val(await op(`select status::text from public.applications where id = $1`, [app4])) === 'declined');
expectErr('X4', 'declined offer cannot be accepted later', await as('v4', `select public.accept_offer($1, $2)`, [offer5, K(8)]), 'WK_OFFER_DECLINED');
const app5 = (await as('v4', `select public.apply_to_opportunity($1) r`, [oppApp])).rows[0].r.application_id;
check('X5', 're-applying after a final outcome is allowed', !!app5 && app5 !== app4);
await as('o1', `select public.review_application($1, 'reject', 'Need weekday availability')`, [app5]);
const rej = await as('v4', `select status::text s, decision_reason from public.my_applications() where application_id = $1`, [app5]);
check('X6', 'volunteer sees rejection and reason', rej.rows?.[0]?.s === 'rejected' && rej.rows[0].decision_reason === 'Need weekday availability', rej);
const app6 = (await as('v3', `select public.apply_to_opportunity($1) r`, [oppApp])).rows[0].r.application_id;
await as('v3', `select public.withdraw_application($1)`, [app6]);
check('X7', 'withdraw before acceptance', val(await op(`select status::text from public.applications where id = $1`, [app6])) === 'withdrawn');

// Direct writes are impossible.
expectErr('D1', 'volunteer cannot insert applications directly', await as('v1', `insert into public.applications (opportunity_id, org_id, volunteer_id) values ($1, $2, $3)`, [oppApp, orgA, uid.v1]), 'permission denied');
expectErr('D2', 'volunteer cannot change application status', await as('v1', `update public.applications set status = 'selected'`), 'permission denied');
expectErr('D3', 'volunteer cannot change offers', await as('v1', `update public.offers set status = 'accepted'`), 'permission denied');
expectErr('D4', 'organization cannot write offers directly', await as('o1', `insert into public.offers (application_id, org_id, shift_id, volunteer_id, expires_at, created_by) values ($1, $2, $3, $4, now() + interval '1 day', $5)`, [app1, orgA, S2, uid.v1, uid.o1]), 'permission denied');
expectErr('D5', 'internal booking core not callable', await as('v1', `select public._join_shift_core($1, $2, $3, true)`, [uid.v1, S2, K(9)]), 'permission denied');
expectErr('D6', 'offer expiry helper not callable', await as('v1', `select public._expire_offers()`), 'permission denied');

// ---- existing open booking path unchanged ------------------------------------
const j = await as('v3', `select public.join_shift($1, $2) r`, [S3, K(10)]);
check('B1', 'open opportunity: join_shift still confirms directly', j.ok && j.rows[0].r.status === 'confirmed', j);

// ---- notifications ------------------------------------------------------------
check('N1', 'volunteer received offer + review notifications',
  (await as('v1', `select count(*)::int n from public.notifications where kind in ('offer_new', 'application_review')`)).rows?.[0]?.n === 2);
check('N2', 'volunteers cannot see each other’s notifications',
  (await as('v2', `select count(*)::int n from public.notifications where user_id = $1`, [uid.v1])).rows?.[0]?.n === 0);
const nr = await as('v1', `update public.notifications set read_at = now() where user_id = $1`, [uid.v1]);
check('N3', 'volunteer can mark own notifications read', nr.ok && nr.affected >= 2, nr);
expectErr('N4', 'notification text cannot be edited', await as('v1', `update public.notifications set title = 'x'`), 'permission denied');

// ---- participation, feedback --------------------------------------------------
const past = val(await op(`insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, created_by)
  values ($1, $2, 'Past', now() - interval '3 days', now() - interval '3 days' + interval '3 hours', 5, $3) returning id`, [oppOpen, orgA, uid.o1]));
const sg = val(await op(`insert into public.signups (shift_id, org_id, volunteer_id, status, slot, idempotency_key)
  values ($1, $2, $3, 'attended', tstzrange(now() - interval '3 days', now() - interval '3 days' + interval '3 hours'), $4) returning id`, [past, orgA, uid.v1, K(11)]));
const pr = val(await op(`insert into public.participation_records (signup_id, shift_id, org_id, volunteer_id, hours, verified_by)
  values ($1, $2, $3, $4, 3, $5) returning id`, [sg, past, orgA, uid.v1, uid.o1]));
check('F0', 'hours-verified notification created', val(await op(`select count(*)::int from public.notifications where user_id = $1 and kind = 'hours_verified'`, [uid.v1])) === 1);
const mp = await as('v1', `select * from public.my_participation()`);
check('F1', 'participation history lists the verified record', mp.ok && mp.rows.length === 1 && Number(mp.rows[0].hours) === 3, mp);
expectErr('F2', 'feedback needs one’s own verified participation', await as('v2', `select public.submit_feedback($1, 5)`, [pr]), 'WK_PARTICIPATION_NOT_FOUND');
const fb = await as('v1', `select public.submit_feedback($1, 4, 'Well organised') r`, [pr]);
check('F3', 'participant leaves feedback', fb.ok, fb);
expectErr('F4', 'duplicate feedback prevented', await as('v1', `select public.submit_feedback($1, 5)`, [pr]), 'WK_ALREADY_REVIEWED');
const pub = await anon(`select * from public.org_feedback($1)`, [orgA]);
check('F5', 'public feedback shows rating and first name only', pub.ok && pub.rows.length === 1 && pub.rows[0].reviewer_first_name === 'V1' &&
  !Object.keys(pub.rows[0]).some(c => /volunteer_id|email|phone/.test(c)), pub);
expectErr('F6', 'organization cannot moderate feedback', await as('o1', `select public.moderate_feedback($1, 'hidden')`, [fb.rows[0].r]), 'WK_FORBIDDEN');
await as('admin', `select public.moderate_feedback($1, 'hidden', 'Off-topic')`, [fb.rows[0].r]);
check('F7', 'hidden feedback disappears from public view', (await anon(`select count(*)::int n from public.org_feedback($1)`, [orgA])).rows?.[0]?.n === 0);

// ---- complaints ---------------------------------------------------------------
const cp = await as('v1', `select public.submit_complaint('Unsafe venue', 'The venue had no fire exit signage at all.', $1, $2) r`, [orgA, oppOpen]);
check('C1', 'volunteer submits a private complaint', cp.ok, cp);
check('C2', 'the organization cannot read complaints about it',
  (await as('o1', `select count(*)::int n from public.complaints`)).rows?.[0]?.n === 0);
check('C3', 'complaint not leaked through the organization audit log',
  (await as('o1', `select count(*)::int n from public.audit_logs where entity_type = 'complaints'`)).rows?.[0]?.n === 0);
expectErr('C4', 'reporter cannot resolve their own complaint', await as('v1', `select public.respond_complaint($1, 'resolved', 'ok')`, [cp.rows[0].r]), 'WK_FORBIDDEN');
expectErr('C5', 'resolution needs a response', await as('admin', `select public.respond_complaint($1, 'resolved')`, [cp.rows[0].r]), 'WK_REASON_REQUIRED');
await as('admin', `select public.respond_complaint($1, 'resolved', 'Organization fixed signage; verified on site.')`, [cp.rows[0].r]);
const myc = await as('v1', `select status::text s, admin_response from public.complaints`);
check('C6', 'reporter sees the resolution', myc.rows?.[0]?.s === 'resolved' && !!myc.rows[0].admin_response, myc);

// ---- suspension and moderation ------------------------------------------------
expectErr('S1', 'organization admin cannot suspend users', await as('o1', `select public.admin_set_suspension($1, true, 'x')`, [uid.v2]), 'WK_FORBIDDEN');
expectErr('S2', 'platform admin cannot suspend another platform admin or self', await as('admin', `select public.admin_set_suspension($1, true, 'x')`, [uid.admin]), 'WK_FORBIDDEN');
expectErr('S3', 'suspension needs a reason', await as('admin', `select public.admin_set_suspension($1, true, null)`, [uid.v2]), 'WK_REASON_REQUIRED');
await as('admin', `select public.admin_set_suspension($1, true, 'Repeated no-shows')`, [uid.v2]);
const S4 = val(await shift(oppOpen, 400, 3));
expectErr('S4', 'suspended volunteer cannot join shifts', await as('v2', `select public.join_shift($1, $2)`, [S4, K(12)]), 'WK_ACCOUNT_SUSPENDED');
expectErr('S5', 'suspended volunteer cannot apply', await as('v2', `select public.apply_to_opportunity($1)`, [oppApp]), 'WK_ACCOUNT_SUSPENDED');
expectErr('S6', 'user cannot lift own suspension', await as('v2', `update public.profiles set suspended_at = null where id = $1`, [uid.v2]), 'permission denied');
await as('admin', `select public.admin_set_suspension($1, false)`, [uid.v2]);
check('S7', 'unsuspended volunteer can join again', (await as('v2', `select public.join_shift($1, $2) r`, [S4, K(13)])).ok);
const au = await as('admin', `select * from public.admin_users()`);
check('S8', 'admin user list includes emails for platform admins only', au.ok && au.rows.length === 8 && au.rows.every(r => r.email), au);
expectErr('S9', 'non-admin cannot list users', await as('o1', `select * from public.admin_users()`), 'WK_FORBIDDEN');
expectErr('M1', 'moderation needs a reason', await as('admin', `select public.admin_moderate_opportunity($1, '')`, [oppOpen]), 'WK_REASON_REQUIRED');
await as('admin', `select public.admin_moderate_opportunity($1, 'Misleading description')`, [oppOpen]);
check('M2', 'moderated opportunity is closed with a reason',
  val(await op(`select status::text || ':' || moderation_reason from public.opportunities where id = $1`, [oppOpen])) === 'closed:Misleading description');
expectErr('M3', 'organization cannot republish a moderated opportunity', await as('o1', `update public.opportunities set status = 'published' where id = $1`, [oppOpen]), 'WK_INVALID_TRANSITION');
expectErr('M4', 'organization cannot clear moderation fields', await as('o1', `update public.opportunities set moderation_reason = null where id = $1`, [oppOpen]), 'permission denied');

// ---- statistics, directory, search -------------------------------------------
const st = await anon(`select public.platform_stats() s`);
const s = st.rows?.[0]?.s;
check('ST1', 'anonymous statistics are real counts', st.ok && s.verified_organizations === 2 && s.active_opportunities === 1 &&
  s.completed_events === 1 && Number(s.verified_hours) === 3 && s.countries === 2 && s.cities === 1, s);
const dir = await anon(`select name, published_opportunities from public.list_organizations()`);
check('ST2', 'organization directory lists verified organizations', dir.ok && dir.rows.length === 2, dir);
const srch = await anon(`select title, compensation_type::text c from public.search_opportunities(p_compensation => 'stipend')`);
check('ST3', 'search filters by compensation type', srch.ok && srch.rows.length === 1 && srch.rows[0].c === 'stipend', srch);
const sk = await anon(`select count(*)::int n from public.search_opportunities(p_skill => 'FIRST AID', p_sort => 'closing')`);
check('ST4', 'skill filter (case-insensitive) with closing-soon sort', sk.rows?.[0]?.n === 1, sk);
expectErr('ST5', 'anonymous cannot read admin overview', await anon(`select public.admin_overview()`), 'permission denied');
check('ST6', 'admin overview counts', (await as('admin', `select public.admin_overview() o`)).rows?.[0]?.o?.complaints_open === 0);

// ---- report -------------------------------------------------------------------
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc}${r.pass ? '' : '  -> ' + r.detail}`);
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
