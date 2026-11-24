// =============================================================================
// Worldkin Roster — live A05 concurrency check (DRAFT, NOT YET RUN)
// Zero dependencies (Node >= 18 global fetch). Talks to the Supabase Data API
// exactly like the browser does: publishable key + a user's access token.
//
// Target: worldkin-roster ONLY. The script refuses to run against any other URL.
//
// Prerequisites (created in milestone M1 after owner approval):
//   - 20 confirmed test volunteers: <prefix>01..<prefix>20@<domain>, same password
//   - SHIFT_FULL_ID     : published shift, capacity 1, waitlist_limit 5, in the future
//   - SHIFT_A_ID/B_ID   : two published future shifts whose times overlap
//
// Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_EMAIL_PREFIX, TEST_EMAIL_DOMAIN,
//      TEST_PASSWORD, SHIFT_FULL_ID, SHIFT_A_ID, SHIFT_B_ID
// Run: node supabase/tests/concurrency_check.mjs
// =============================================================================
const env = process.env;
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_PUBLISHABLE_KEY;
if (URL_ !== 'https://ekkvwgohpzliwbmjnrth.supabase.co') {
  console.error('Refusing to run: SUPABASE_URL is not the Worldkin project.');
  process.exit(2);
}

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: env.TEST_PASSWORD }),
  });
  if (!r.ok) throw new Error(`sign-in failed for ${email}: ${r.status}`);
  return (await r.json()).access_token;
}

async function rpc(token, fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await r.json().catch(() => null);
  return r.ok ? { ok: true, data: body } : { ok: false, code: body?.message, status: r.status };
}

const emails = Array.from({ length: 20 }, (_, i) =>
  `${env.TEST_EMAIL_PREFIX}${String(i + 1).padStart(2, '0')}@${env.TEST_EMAIL_DOMAIN}`);
const tokens = await Promise.all(emails.map(signIn));
let failures = 0;
const assert = (name, cond, info) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`, cond ? '' : JSON.stringify(info));
  if (!cond) failures++;
};

// C1 — 20 volunteers race for 1 seat (+5 waitlist) at the same instant.
const c1 = await Promise.all(tokens.map(t =>
  rpc(t, 'join_shift', { p_shift_id: env.SHIFT_FULL_ID, p_idempotency_key: crypto.randomUUID() })));
const confirmed = c1.filter(r => r.ok && r.data.status === 'confirmed').length;
const waitlisted = c1.filter(r => r.ok && r.data.status === 'waitlisted');
const full = c1.filter(r => !r.ok && r.code === 'WK_SHIFT_FULL').length;
const positions = waitlisted.map(r => r.data.waitlist_position).sort((a, b) => a - b);
assert('C1 exactly 1 confirmed', confirmed === 1, { confirmed });
assert('C1 exactly 5 waitlisted', waitlisted.length === 5, { waitlisted: waitlisted.length });
assert('C1 waitlist positions are 1..5 without gaps', positions.join() === '1,2,3,4,5', positions);
assert('C1 remaining 14 rejected as full', full === 14, { full });

// C2 — one volunteer double-clicks: 5 parallel calls with the SAME idempotency key.
const key = crypto.randomUUID();
const c2 = await Promise.all(Array.from({ length: 5 }, () =>
  rpc(tokens[19], 'join_shift', { p_shift_id: env.SHIFT_A_ID, p_idempotency_key: key })));
const ids = new Set(c2.filter(r => r.ok).map(r => r.data.signup_id));
assert('C2 all 5 calls succeed', c2.every(r => r.ok), c2);
assert('C2 one signup row only', ids.size === 1, [...ids]);
assert('C2 exactly one non-replayed', c2.filter(r => r.ok && !r.data.replayed).length === 1, c2);

// C3 — one volunteer requests two overlapping shifts at the same instant.
const c3 = await Promise.all([
  rpc(tokens[18], 'join_shift', { p_shift_id: env.SHIFT_A_ID, p_idempotency_key: crypto.randomUUID() }),
  rpc(tokens[18], 'join_shift', { p_shift_id: env.SHIFT_B_ID, p_idempotency_key: crypto.randomUUID() }),
]);
assert('C3 exactly one succeeds', c3.filter(r => r.ok).length === 1, c3);
assert('C3 other is WK_SCHEDULE_CONFLICT', c3.some(r => !r.ok && r.code === 'WK_SCHEDULE_CONFLICT'), c3);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
