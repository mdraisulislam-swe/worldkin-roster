// Shared helpers for live Worldkin API tests (zero dependencies, Node >= 18).
// Talks to the Data API exactly like the browser: publishable key + user JWT.
// Refuses to run against anything except the Worldkin project.
// Test password: from TEST_PASSWORD, or read from TEST_PASSWORD_FILE (kept outside the repo).
if (!process.env.TEST_PASSWORD && process.env.TEST_PASSWORD_FILE) {
  process.env.TEST_PASSWORD = (await import('node:fs')).readFileSync(process.env.TEST_PASSWORD_FILE, 'utf8').trim()
}
export const WORLDKIN_URL = 'https://ekkvwgohpzliwbmjnrth.supabase.co';
const env = process.env;

export function requireEnv() {
  if (env.SUPABASE_URL !== WORLDKIN_URL) {
    console.error(`Refusing to run: SUPABASE_URL must be exactly ${WORLDKIN_URL}`);
    process.exit(2);
  }
  for (const k of ['SUPABASE_PUBLISHABLE_KEY', 'TEST_PASSWORD']) {
    if (!env[k]) { console.error(`Missing ${k}`); process.exit(2); }
  }
}

export const DOMAIN = env.TEST_EMAIL_DOMAIN || 'worldkin.test';
export const email = local => `${local}@${DOMAIN}`;
const KEY = () => env.SUPABASE_PUBLISHABLE_KEY;

export async function signIn(addr, password = env.TEST_PASSWORD) {
  const r = await fetch(`${WORLDKIN_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY(), 'content-type': 'application/json' },
    body: JSON.stringify({ email: addr, password }),
  });
  if (!r.ok) throw new Error(`sign-in failed for ${addr}: HTTP ${r.status}`);
  const j = await r.json();
  return { token: j.access_token, id: j.user.id };
}

function headers(token, extra = {}) {
  return {
    apikey: KEY(),
    authorization: `Bearer ${token ?? KEY()}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function wrap(r) {
  const body = await r.json().catch(() => null);
  return r.ok
    ? { ok: true, status: r.status, data: body }
    : { ok: false, status: r.status, code: body?.code, msg: body?.message };
}

export const rpc = (token, fn, args = {}) =>
  fetch(`${WORLDKIN_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(token), body: JSON.stringify(args) }).then(wrap);

export const select = (token, path) =>
  fetch(`${WORLDKIN_URL}/rest/v1/${path}`, { headers: headers(token) }).then(wrap);

export const insert = (token, table, row) =>
  fetch(`${WORLDKIN_URL}/rest/v1/${table}`, {
    method: 'POST', headers: headers(token, { prefer: 'return=representation' }), body: JSON.stringify(row),
  }).then(wrap);

export const patch = (token, path, values) =>
  fetch(`${WORLDKIN_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: headers(token, { prefer: 'return=representation' }), body: JSON.stringify(values),
  }).then(wrap);

// Simple result recorder: prints PASS/FAIL lines with a timestamp header.
export function reporter(title) {
  let failures = 0;
  console.log(`# ${title}\n# run at ${new Date().toISOString()} against ${WORLDKIN_URL}\n`);
  return {
    check(id, desc, cond, info) {
      console.log(`${cond ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${desc}${cond ? '' : `\n        -> ${JSON.stringify(info).slice(0, 300)}`}`);
      if (!cond) failures++;
    },
    done() {
      console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
      process.exit(failures ? 1 : 0);
    },
  };
}

// Future timestamp helper (ISO), offset in hours from now.
export const inHours = h => new Date(Date.now() + h * 3600_000).toISOString();
