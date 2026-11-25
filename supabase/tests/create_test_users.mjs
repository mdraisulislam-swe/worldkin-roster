// =============================================================================
// Worldkin Roster — create pre-confirmed demo + load-test users (M1 step c)
// -----------------------------------------------------------------------------
// Zero dependencies (Node >= 18). Uses the Supabase Auth Admin API.
// RUN IN THE OWNER'S terminal session. The secret key is read only from an
// environment variable of that session (never from a file); the test password
// comes from TEST_PASSWORD or a file outside the repo. Nothing secret is printed.
//
//   $env:SUPABASE_URL        = "https://ekkvwgohpzliwbmjnrth.supabase.co"
//   $env:SUPABASE_SECRET_KEY = "<secret key from Dashboard → Settings → API keys>"
//   $env:TEST_PASSWORD_FILE  = "<path to a file OUTSIDE the repo holding the test password, >= 12 chars>"
//   node supabase/tests/create_test_users.mjs
//   Remove-Item Env:SUPABASE_SECRET_KEY   # afterwards
//
// Optional: $env:TEST_EMAIL_DOMAIN (default "worldkin.test", an RFC 2606
// reserved domain that can never receive real mail).
//
// Idempotent: accounts that already exist are reported and left unchanged.
// Every new account starts as 'volunteer' (the profile trigger ignores any
// role in metadata). Roles/memberships are assigned later by the seed step.
// =============================================================================
// Test password: from TEST_PASSWORD, or read from TEST_PASSWORD_FILE (kept outside the repo).
if (!process.env.TEST_PASSWORD && process.env.TEST_PASSWORD_FILE) {
  process.env.TEST_PASSWORD = (await import('node:fs')).readFileSync(process.env.TEST_PASSWORD_FILE, 'utf8').trim()
}
const WORLDKIN_URL = 'https://ekkvwgohpzliwbmjnrth.supabase.co';
const { SUPABASE_URL, SUPABASE_SECRET_KEY, TEST_PASSWORD } = process.env;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'worldkin.test';

if (SUPABASE_URL !== WORLDKIN_URL) {
  console.error(`Refusing to run: SUPABASE_URL must be exactly ${WORLDKIN_URL}`);
  process.exit(2);
}
if (!SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_SECRET_KEY (set it in this terminal session only).');
  process.exit(2);
}
if (!TEST_PASSWORD || TEST_PASSWORD.length < 12) {
  console.error('TEST_PASSWORD must be set and at least 12 characters long.');
  process.exit(2);
}

export const ACCOUNTS = [
  { local: 'demo.orgadmin', name: 'Demo Org Admin' },
  { local: 'demo.coordinator', name: 'Demo Coordinator' },
  { local: 'demo.volunteer1', name: 'Demo Volunteer One' },
  { local: 'demo.volunteer2', name: 'Demo Volunteer Two' },
  ...Array.from({ length: 10 }, (_, i) => ({
    local: `load${String(i + 1).padStart(2, '0')}`,
    name: `Load Test ${String(i + 1).padStart(2, '0')}`,
  })),
];

const headers = {
  apikey: SUPABASE_SECRET_KEY,
  authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
  'content-type': 'application/json',
};

let created = 0, existed = 0, failed = 0;
for (const a of ACCOUNTS) {
  const email = `${a.local}@${DOMAIN}`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: a.name },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    created++;
    console.log(`CREATED  ${email}  id=${body.id}`);
  } else if (res.status === 422 && /already|exists|registered/i.test(JSON.stringify(body))) {
    existed++;
    console.log(`EXISTS   ${email}`);
  } else {
    failed++;
    // Never echo request headers; the error body contains no secrets.
    console.log(`FAILED   ${email}  status=${res.status}  ${body.msg || body.message || body.error_code || ''}`);
  }
}
console.log(`\ncreated=${created} existed=${existed} failed=${failed} (of ${ACCOUNTS.length})`);
process.exit(failed ? 1 : 0);
