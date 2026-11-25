// =============================================================================
// Worldkin Roster — live check for migration wk07 (storage isolation, A03)
// -----------------------------------------------------------------------------
// Uses the real Storage API with real user tokens. Test files are named
// "wk-test-<run>…"; deletes are intentionally impossible for users (verification
// evidence is kept): the one test PDF stays and is removed by the owner in the
// Dashboard (Storage > org-docs > wk-test-*). The test avatar is deleted here.
// Prerequisites: wk06 + wk07 applied, demo seed applied.
// Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_PASSWORD or TEST_PASSWORD_FILE
// Run: node supabase/tests/live_storage_check.mjs
// =============================================================================
import { requireEnv, email, signIn, select, reporter, WORLDKIN_URL } from './lib/api.mjs';

requireEnv();
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const t = reporter('wk07 storage isolation (live)');
const run = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const ST = `${WORLDKIN_URL}/storage/v1/object`;
const hdr = (token, extra = {}) => ({ apikey: KEY, authorization: `Bearer ${token ?? KEY}`, ...extra });
const upload = (token, bucket, path, body, type) =>
  fetch(`${ST}/${bucket}/${path}`, { method: 'POST', headers: hdr(token, { 'content-type': type, 'x-upsert': 'false' }), body }).then((r) => r.status);
const read = (token, bucket, path) => fetch(`${ST}/authenticated/${bucket}/${path}`, { headers: hdr(token) }).then((r) => r.status);
const del = (token, bucket, path) => fetch(`${ST}/${bucket}/${path}`, { method: 'DELETE', headers: hdr(token) }).then(async (r) => ({ status: r.status, body: await r.text() }));
const pdf = new Blob(['%PDF-1.4\n% wk test document\n'], { type: 'application/pdf' });
const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))], { type: 'image/png' });

const orgAdmin = await signIn(email('demo.orgadmin'));
const coord = await signIn(email('demo.coordinator'));
const vol = await signIn(email('demo.volunteer1'));
const otherAdmin = await signIn(email('demo.volunteer2')); // admin of the pending demo organization

const orgA = (await select(orgAdmin.token, 'organizations?slug=eq.dhaka-food-relief&select=id')).data?.[0]?.id;
const orgB = (await select(otherAdmin.token, 'organizations?slug=eq.coastal-cleanup&select=id')).data?.[0]?.id;
if (!orgA || !orgB) { console.error('Demo organizations not found — apply the demo seed first.'); process.exit(2); }
const doc = `${orgA}/wk-test-${run}.pdf`;

t.check('S1', 'org admin uploads a verification document to own org folder', (await upload(orgAdmin.token, 'org-docs', doc, pdf, 'application/pdf')) === 200);
t.check('S2', 'coordinator of the same organization can read it', (await read(coord.token, 'org-docs', doc)) === 200);
t.check('S3', 'volunteer outside the organization cannot read it', (await read(vol.token, 'org-docs', doc)) !== 200);
t.check('S4', 'anonymous visitor cannot read it', (await read(null, 'org-docs', doc)) !== 200);
t.check('S5', 'coordinator (not admin) cannot upload documents', (await upload(coord.token, 'org-docs', `${orgA}/wk-test-${run}-c.pdf`, pdf, 'application/pdf')) !== 200);
t.check('S6', 'org admin cannot upload into another organization folder', (await upload(orgAdmin.token, 'org-docs', `${orgB}/wk-test-${run}.pdf`, pdf, 'application/pdf')) !== 200);
t.check('S7', 'admin of the other organization cannot read this document', (await read(otherAdmin.token, 'org-docs', doc)) !== 200);
const d = await del(orgAdmin.token, 'org-docs', doc);
t.check('S8', 'documents cannot be deleted by users (evidence kept)', (await read(coord.token, 'org-docs', doc)) === 200, d);
t.check('S9', 'disallowed file type is rejected by the bucket', (await upload(orgAdmin.token, 'org-docs', `${orgA}/wk-test-${run}.txt`, new Blob(['x']), 'text/plain')) !== 200);
t.check('S10', 'volunteer uploads own profile photo', (await upload(vol.token, 'avatars', `${vol.id}/wk-test-${run}.png`, png, 'image/png')) === 200);
t.check('S11', 'volunteer cannot write into another user folder', (await upload(vol.token, 'avatars', `${coord.id}/wk-test-${run}.png`, png, 'image/png')) !== 200);
const pub = await fetch(`${WORLDKIN_URL}/storage/v1/object/public/avatars/${vol.id}/wk-test-${run}.png`).then((r) => r.status);
t.check('S12', 'profile photos are public by design (public URL works)', pub === 200, pub);
const list = await fetch(`${WORLDKIN_URL}/storage/v1/object/list/avatars`, { method: 'POST', headers: hdr(null, { 'content-type': 'application/json' }), body: JSON.stringify({ prefix: `${vol.id}/` }) }).then(async (r) => (r.ok ? r.json() : []));
t.check('S13', 'anonymous visitors cannot list stored files', Array.isArray(list) && list.length === 0, list);
// Plain insert (the app inserts the first private row, then updates): must be refused by the CHECK constraint.
const spoof = await fetch(`${WORLDKIN_URL}/rest/v1/organization_private`, {
  method: 'POST', headers: hdr(orgAdmin.token, { 'content-type': 'application/json', prefer: 'return=minimal' }),
  body: JSON.stringify({ org_id: orgA, verification_docs: [`${orgB}/certificate.pdf`] }),
}).then(async (r) => ({ status: r.status, body: await r.text() }));
t.check('S14', 'document list cannot reference another organization’s file (C1)', spoof.status >= 400 && /docs_in_own_folder/.test(spoof.body), spoof);
const own = await del(vol.token, 'avatars', `${vol.id}/wk-test-${run}.png`);
// Public files are CDN-cached; a unique query string asks the origin, which must no longer have the file.
const gone = await fetch(`${WORLDKIN_URL}/storage/v1/object/public/avatars/${vol.id}/wk-test-${run}.png?check=${Date.now()}`).then((r) => r.status);
t.check('S15', 'owner can delete own test avatar (cleanup)', own.status === 200 && gone !== 200, { own, gone });
console.log(`\nManual cleanup: delete org-docs/${doc} in the Supabase Dashboard (users cannot delete documents by design).`);
t.done();
