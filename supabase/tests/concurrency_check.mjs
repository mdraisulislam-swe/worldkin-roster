// =============================================================================
// Worldkin Roster — live A05 concurrency check
// -----------------------------------------------------------------------------
// Runs real parallel requests through the Supabase Data API (PostgREST), so
// every request is its own database transaction on its own connection.
// Self-contained: creates its own "[TEST]" fixtures through the demo
// coordinator account and cancels/closes them afterwards, so it can be run
// repeatedly (the owner runs it 3 times for evidence).
//
// Prerequisites: migrations applied, demo seed applied (organization
// "dhaka-food-relief" with demo.coordinator as coordinator), users from
// create_test_users.mjs (demo.coordinator, load01..load10).
//
// Env (owner's terminal session only):
//   SUPABASE_URL=https://ekkvwgohpzliwbmjnrth.supabase.co
//   SUPABASE_PUBLISHABLE_KEY=<publishable key — public by design>
//   TEST_PASSWORD=<test account password>
// Run: node supabase/tests/concurrency_check.mjs
// =============================================================================
import { requireEnv, email, signIn, rpc, select, insert, patch, reporter, inHours } from './lib/api.mjs';

requireEnv();
const t = reporter('A05 concurrency check (live)');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

// ---- actors -----------------------------------------------------------------
const coord = await signIn(email('demo.coordinator'));
const load = await Promise.all(
  Array.from({ length: 10 }, (_, i) => signIn(email(`load${String(i + 1).padStart(2, '0')}`))));

// ---- fixtures (created through the API as the coordinator) -------------------
const org = await select(coord.token, 'organizations?slug=eq.dhaka-food-relief&select=id');
const orgId = org.data?.[0]?.id;
if (!orgId) { console.error('Seed organization dhaka-food-relief not found — apply the demo seed first.'); process.exit(2); }

const opp = await insert(coord.token, 'opportunities', {
  org_id: orgId, title: `[TEST] Concurrency drill ${runId}`,
  description: 'Automated A05 test fixture. Safe to ignore.', cause: 'other', mode: 'remote', status: 'published',
});
const oppId = opp.data?.[0]?.id;
const mkShift = (startH, endH, capacity, waitlist_limit) => insert(coord.token, 'shifts', {
  opportunity_id: oppId, org_id: orgId, title: `[TEST] ${runId}`,
  starts_at: inHours(startH), ends_at: inHours(endH), capacity, waitlist_limit,
});
const shiftFull = (await mkShift(240, 242, 1, 3)).data?.[0]?.id;   // capacity 1, waitlist 3
const shiftA = (await mkShift(260, 263, 5, 0)).data?.[0]?.id;      // A and B overlap by 2 hours
const shiftB = (await mkShift(261, 264, 5, 0)).data?.[0]?.id;
t.check('SETUP', 'fixtures created through the API (opportunity + 3 shifts)', oppId && shiftFull && shiftA && shiftB, { opp, shiftFull, shiftA, shiftB });

// ---- C1: 10 volunteers race for 1 seat (+3 waitlist) at the same instant -----
const c1 = await Promise.all(load.map(u =>
  rpc(u.token, 'join_shift', { p_shift_id: shiftFull, p_idempotency_key: crypto.randomUUID() })));
const confirmed = c1.filter(r => r.ok && r.data.status === 'confirmed').length;
const waitlisted = c1.filter(r => r.ok && r.data.status === 'waitlisted');
const full = c1.filter(r => !r.ok && r.msg === 'WK_SHIFT_FULL').length;
const positions = waitlisted.map(r => r.data.waitlist_position).sort((a, b) => a - b);
t.check('C1a', 'exactly 1 confirmed out of 10 parallel joins', confirmed === 1, { confirmed, c1 });
t.check('C1b', 'exactly 3 waitlisted', waitlisted.length === 3, { waitlisted: waitlisted.length });
t.check('C1c', 'waitlist positions are 1,2,3 (FIFO, no gaps)', positions.join() === '1,2,3', positions);
t.check('C1d', 'remaining 6 rejected with WK_SHIFT_FULL', full === 6, { full });
const avail = await rpc(coord.token, 'shift_availability', { p_opportunity_id: oppId });
const row = avail.data?.find(r => r.shift_id === shiftFull);
t.check('C1e', 'database state: confirmed=1 <= capacity, waitlisted=3 <= limit', row?.confirmed === 1 && row?.waitlisted === 3, row);

// ---- C2: one volunteer double-clicks: 5 parallel calls, same idempotency key -
const key = crypto.randomUUID();
const c2 = await Promise.all(Array.from({ length: 5 }, () =>
  rpc(load[8].token, 'join_shift', { p_shift_id: shiftA, p_idempotency_key: key })));
const ids = new Set(c2.filter(r => r.ok).map(r => r.data.signup_id));
t.check('C2a', 'all 5 identical requests succeed', c2.every(r => r.ok), c2);
t.check('C2b', 'only one signup row created', ids.size === 1, [...ids]);
t.check('C2c', 'exactly one non-replayed response', c2.filter(r => r.ok && !r.data.replayed).length === 1, c2);

// ---- C3: one volunteer requests two overlapping shifts at the same instant --
const c3 = await Promise.all([
  rpc(load[9].token, 'join_shift', { p_shift_id: shiftA, p_idempotency_key: crypto.randomUUID() }),
  rpc(load[9].token, 'join_shift', { p_shift_id: shiftB, p_idempotency_key: crypto.randomUUID() }),
]);
t.check('C3a', 'exactly one of two overlapping joins succeeds', c3.filter(r => r.ok).length === 1, c3);
t.check('C3b', 'the other is WK_SCHEDULE_CONFLICT', c3.some(r => !r.ok && r.msg === 'WK_SCHEDULE_CONFLICT'), c3);

// ---- C4: confirmed volunteer cancels -> waitlist #1 promoted (FIFO) ----------
const winner = c1.find(r => r.ok && r.data.status === 'confirmed');
const head = waitlisted.find(r => r.data.waitlist_position === 1);
const winnerIdx = c1.indexOf(winner);
const cancel = await rpc(load[winnerIdx].token, 'cancel_signup', { p_signup_id: winner?.data.signup_id });
t.check('C4', 'cancel promotes the waitlist head', cancel.ok && cancel.data.promoted_signup_ids?.[0] === head?.data.signup_id, cancel);

// ---- cleanup (cancel fixtures so the next run starts clean) ------------------
const cleaned = await Promise.all([shiftFull, shiftA, shiftB].map(id =>
  rpc(coord.token, 'cancel_shift', { p_shift_id: id, p_reason: `automated test cleanup ${runId}` })));
const closed = await patch(coord.token, `opportunities?id=eq.${oppId}`, { status: 'closed' });
t.check('CLEAN', 'fixtures cancelled and test opportunity closed', cleaned.every(r => r.ok) && closed.ok, { cleaned, closed });
t.done();
