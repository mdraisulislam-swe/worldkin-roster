// =============================================================================
// Worldkin Roster — live check for migration wk06 (applications & offers)
// -----------------------------------------------------------------------------
// Real parallel requests through the Data API (each its own transaction).
// Self-contained "[TEST]" fixtures created by demo.coordinator, cleaned up by
// cancelling the test shifts and closing the test opportunity.
// Prerequisites: wk06 applied, demo seed applied, test users load01..load06.
// Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_PASSWORD or TEST_PASSWORD_FILE
// Run: node supabase/tests/live_applications_check.mjs
// =============================================================================
import { requireEnv, email, signIn, rpc, select, insert, reporter, inHours } from './lib/api.mjs';

requireEnv();
const t = reporter('wk06 applications & offers (live)');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const coord = await signIn(email('demo.coordinator'));
const v = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => signIn(email(`load0${i}`))));
const [v1, v2, v3, v4, v5, v6] = v;

const org = await select(coord.token, 'organizations?slug=eq.dhaka-food-relief&select=id');
const orgId = org.data?.[0]?.id;
if (!orgId) { console.error('Seed organization not found — apply the demo seed first.'); process.exit(2); }

const opp = await insert(coord.token, 'opportunities', {
  org_id: orgId, title: `[TEST] Selection drill ${runId}`, description: 'Automated wk06 test fixture. Safe to ignore.',
  cause: 'other', mode: 'remote', status: 'published', compensation_type: 'stipend', compensation_details: 'TEST stipend 10 USD/day',
  selection_mode: 'application', application_deadline: inHours(48),
});
const oppId = opp.data?.[0]?.id;
const mk = (h) => insert(coord.token, 'shifts', { opportunity_id: oppId, org_id: orgId, title: `[TEST] ${runId} +${h}h`, starts_at: inHours(h), ends_at: inHours(h + 2), capacity: 1 });
const shiftA = (await mk(50)).data?.[0]?.id;
const shiftB = (await mk(60)).data?.[0]?.id;
t.check('SETUP', 'stipend application opportunity + 2 shifts (capacity 1) created via API', !!oppId && !!shiftA && !!shiftB, { opp, shiftA, shiftB });

const key = () => crypto.randomUUID();
const j = await rpc(v1.token, 'join_shift', { p_shift_id: shiftA, p_idempotency_key: key() });
t.check('L1', 'direct join refused: WK_APPLICATION_REQUIRED', !j.ok && /WK_APPLICATION_REQUIRED/.test(j.msg), j);

const apply = (u, msg = null) => rpc(u.token, 'apply_to_opportunity', { p_opportunity_id: oppId, p_message: msg });
const apps = {};
for (const [n, u] of Object.entries({ v1, v2, v3, v4 })) apps[n] = (await apply(u, `I am ${n}`)).data?.application_id;
t.check('L2', 'four volunteers applied', Object.values(apps).every(Boolean), apps);

// Duplicate prevention under concurrency: 5 parallel applications from one volunteer.
const dup = await Promise.all(Array.from({ length: 5 }, () => apply(v5)));
const v5rows = await select(v5.token, `applications?opportunity_id=eq.${oppId}&select=id`);
t.check('L3', '5 parallel applications → exactly 1 row', dup.every((r) => r.ok) && v5rows.data?.length === 1, { dup: dup.map((r) => r.data ?? r.msg), rows: v5rows.data });

const own = await select(v2.token, `applications?select=id,volunteer_id`);
t.check('L4', 'volunteer sees only own applications', own.ok && own.data.every((r) => r.volunteer_id === v2.id), own);
const forb = await rpc(v2.token, 'org_applications', { p_org_id: orgId });
t.check('L5', 'volunteer cannot list organization applicants', !forb.ok && /WK_FORBIDDEN/.test(forb.msg), forb);
const anonApps = await select(null, 'applications?select=id');
t.check('L6', 'anonymous cannot read applications', !anonApps.ok, anonApps);
const list = await rpc(coord.token, 'org_applications', { p_org_id: orgId, p_opportunity_id: oppId });
const cols = Object.keys(list.data?.[0] ?? {});
t.check('L7', 'coordinator lists applicants without phone/email/address', list.ok && list.data.length === 5 && !cols.some((c) => /phone|email|address/.test(c)), { n: list.data?.length, cols });

const offer = async (app, shift) => (await rpc(coord.token, 'send_offer', { p_application_id: app, p_shift_id: shift })).data?.offer_id;
const o1 = await offer(apps.v1, shiftA), o2 = await offer(apps.v2, shiftA);
t.check('L8', 'two offers for the same 1-seat shift', !!o1 && !!o2);

// A05: two volunteers accept offers for the last seat at the same moment.
const [a1, a2] = await Promise.all([
  rpc(v1.token, 'accept_offer', { p_offer_id: o1, p_idempotency_key: key() }),
  rpc(v2.token, 'accept_offer', { p_offer_id: o2, p_idempotency_key: key() }),
]);
const statuses = [a1.data?.status, a2.data?.status].sort();
t.check('C1', 'simultaneous acceptance for the last seat → 1 confirmed + 1 waitlisted', a1.ok && a2.ok && statuses[0] === 'confirmed' && statuses[1] === 'waitlisted', { a1, a2 });
const seats = await select(coord.token, `signups?shift_id=eq.${shiftA}&status=eq.confirmed&select=id`);
t.check('C2', 'no overbooking (confirmed = capacity = 1)', seats.data?.length === 1, seats);

// A05: the same offer accepted 3 times in parallel (retries with different keys) → one signup.
const o3 = await offer(apps.v3, shiftB);
const triple = await Promise.all([0, 1, 2].map(() => rpc(v3.token, 'accept_offer', { p_offer_id: o3, p_idempotency_key: key() })));
const v3signups = await select(v3.token, `signups?shift_id=eq.${shiftB}&select=id`);
t.check('C3', 'triple parallel acceptance → all succeed, one non-replayed, one signup', triple.every((r) => r.ok) &&
  triple.filter((r) => r.data?.replayed === false).length === 1 && v3signups.data?.length === 1, { triple: triple.map((r) => r.data ?? r.msg), v3signups });

const o4 = await offer(apps.v4, shiftB);
const rv = await rpc(coord.token, 'revoke_offer', { p_offer_id: o4, p_reason: 'TEST revoke' });
const acc4 = await rpc(v4.token, 'accept_offer', { p_offer_id: o4, p_idempotency_key: key() });
t.check('L9', 'revoked offer cannot be accepted', rv.ok && !acc4.ok && /WK_OFFER_REVOKED/.test(acc4.msg), { rv, acc4 });

const app5 = v5rows.data?.[0]?.id;
await rpc(coord.token, 'review_application', { p_application_id: app5, p_action: 'reject', p_reason: 'TEST reason' });
const mine5 = await rpc(v5.token, 'my_applications');
const r5 = mine5.data?.find((a) => a.application_id === app5);
t.check('L10', 'rejected volunteer sees status and reason', r5?.status === 'rejected' && r5?.decision_reason === 'TEST reason', r5);

const forge = await rpc(v6.token, 'accept_offer', { p_offer_id: o2, p_idempotency_key: key() });
t.check('S1', 'another volunteer cannot accept someone else’s offer', !forge.ok && /WK_OFFER_NOT_FOUND/.test(forge.msg), forge);
const direct = await insert(v6.token, 'applications', { opportunity_id: oppId, org_id: orgId, volunteer_id: v6.id, status: 'selected' });
t.check('S2', 'direct insert into applications is denied', !direct.ok, direct);
const core = await rpc(v6.token, '_join_shift_core', { p_uid: v6.id, p_shift_id: shiftB, p_idempotency_key: key(), p_via_offer: true });
t.check('S3', 'internal booking core is not callable through the API', !core.ok, core);
const notes = await select(v1.token, 'application_notes?select=note');
t.check('S4', 'volunteer reads no private review notes', notes.ok && notes.data.length === 0, notes);
const notif = await select(v1.token, `notifications?kind=eq.offer_new&select=id`);
t.check('N1', 'offer notification delivered to the volunteer', notif.ok && notif.data.length >= 1, notif);
const stats = await rpc(null, 'platform_stats');
t.check('ST1', 'anonymous platform statistics', stats.ok && typeof stats.data?.verified_organizations === 'number', stats);

// Cleanup: cancel the test shifts (cancels their signups) and close the opportunity.
const cleaned = await Promise.all([shiftA, shiftB].map((s) => rpc(coord.token, 'cancel_shift', { p_shift_id: s, p_reason: '[TEST] cleanup' })));
const { patch } = await import('./lib/api.mjs');
const closed = await patch(coord.token, `opportunities?id=eq.${oppId}`, { status: 'closed' });
t.check('CLEAN', 'test shifts cancelled and test opportunity closed', cleaned.every((r) => r.ok) && closed.ok, { cleaned, closed });
t.done();
