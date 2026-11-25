// =============================================================================
// Worldkin Roster — live A03 security smoke test
// -----------------------------------------------------------------------------
// Exercises RLS, column privileges, RPC authorization and the hardened
// past-shift guard through the real Data API (PostgREST -> authenticator).
// Prerequisites: migrations + demo seed applied; demo users created.
//
// Env (owner's terminal session only):
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_PASSWORD
//   Optional: FOUNDER_EMAIL, FOUNDER_PASSWORD  (adds the platform-admin check)
// Run: node supabase/tests/live_security_check.mjs
// Writes: one "[TEST]" shift (cancelled at the end) and two invites (revoked).
// =============================================================================
import { requireEnv, email, signIn, rpc, select, insert, patch, reporter, inHours, DOMAIN } from './lib/api.mjs';

requireEnv();
const t = reporter('A03 security smoke test (live)');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const vol = await signIn(email('demo.volunteer1'));
const coord = await signIn(email('demo.coordinator'));
const oadmin = await signIn(email('demo.orgadmin'));

const orgA = (await select(null, 'organizations?slug=eq.dhaka-food-relief&select=id')).data?.[0]?.id;
const orgB = (await select(null, 'organizations?slug=eq.green-delta-climate&select=id')).data?.[0]?.id;
const pendingOrg = (await select(oadmin.token, 'organizations?status=eq.pending&select=id&limit=1')).data?.[0]?.id
  ?? (await select(coord.token, 'organizations?status=eq.pending&select=id&limit=1')).data?.[0]?.id;
const oppA = (await select(coord.token, `opportunities?org_id=eq.${orgA}&status=eq.published&select=id&limit=1`)).data?.[0]?.id;
const shiftB = (await select(null, `shifts?org_id=eq.${orgB}&select=id&limit=1`)).data?.[0]?.id;
t.check('SETUP', 'seed data reachable (2 verified orgs, opportunity, shift)', orgA && orgB && oppA && shiftB, { orgA, orgB, oppA, shiftB });

// ---- anonymous visitor --------------------------------------------------------
const a1 = await select(null, 'signups?select=id');
t.check('L1', 'anon cannot read signups', !a1.ok, a1);
const a2 = await select(null, 'profiles?select=id');
t.check('L2', 'anon cannot read profiles', !a2.ok, a2);
const a3 = await select(null, 'opportunities?select=id,is_sensitive,status');
t.check('L3', 'anon sees only published, non-sensitive opportunities',
  a3.ok && a3.data.length > 0 && a3.data.every(o => o.status === 'published' && !o.is_sensitive), a3);

// ---- volunteer: escalation and direct writes ------------------------------------
const v1 = await patch(vol.token, `profiles?id=eq.${vol.id}`, { platform_role: 'platform_admin' });
t.check('L4', 'volunteer cannot set own platform_role', !v1.ok && v1.code === '42501', v1);
const v2 = await insert(vol.token, 'signups', {
  shift_id: shiftB, org_id: orgB, volunteer_id: vol.id, status: 'confirmed',
  slot: `[${inHours(500)},${inHours(501)})`, idempotency_key: crypto.randomUUID(),
});
t.check('L5', 'volunteer cannot insert signups directly (capacity bypass)', !v2.ok, v2);
const v3 = await rpc(vol.token, 'review_organization', { p_org_id: pendingOrg ?? orgA, p_decision: 'verified' });
t.check('L6', 'volunteer cannot review organizations', !v3.ok && v3.msg === 'WK_FORBIDDEN', v3);
const v4 = await rpc(vol.token, '_promote_waitlist', { p_shift_id: shiftB });
t.check('L7', 'internal function _promote_waitlist is not callable', !v4.ok, v4);
const v5 = await select(vol.token, 'signups?select=volunteer_id');
t.check('L8', 'volunteer sees only own signups', v5.ok && v5.data.every(s => s.volunteer_id === vol.id), v5);
const v6 = await select(vol.token, 'audit_logs?select=id');
t.check('L9', 'volunteer reads no audit log rows', v6.ok && v6.data.length === 0, v6);
const v7 = await rpc(vol.token, 'is_platform_admin');
t.check('L10', 'volunteer is not a platform admin', v7.ok && v7.data === false, v7);

// ---- coordinator: organization isolation + hardened past-shift guard -------------
const c1 = await rpc(coord.token, 'get_shift_roster', { p_shift_id: shiftB });
t.check('L11', 'coordinator of org A cannot read org B roster', !c1.ok && c1.msg === 'WK_SHIFT_NOT_FOUND', c1);
const c2 = await insert(coord.token, 'shifts', {
  opportunity_id: oppA, org_id: orgA, title: `[TEST] past ${runId}`,
  starts_at: inHours(-3), ends_at: inHours(-1), capacity: 1,
});
t.check('L12', 'API cannot create a past shift (P1, authenticator detected)', !c2.ok && c2.msg === 'WK_SHIFT_IN_PAST', c2);
const fut = await insert(coord.token, 'shifts', {
  opportunity_id: oppA, org_id: orgA, title: `[TEST] guard ${runId}`,
  starts_at: inHours(400), ends_at: inHours(401), capacity: 1,
});
const futId = fut.data?.[0]?.id;
const c3 = await patch(coord.token, `shifts?id=eq.${futId}`, { starts_at: inHours(-2), ends_at: inHours(-1) });
t.check('L13', 'API cannot move a shift into the past (P2)', futId && !c3.ok && c3.msg === 'WK_SHIFT_IN_PAST', c3);
const c4 = await patch(coord.token, `shifts?id=eq.${futId}`, { capacity: 99 });
t.check('L14', 'capacity is not directly writable', !c4.ok && c4.code === '42501', c4);
const c5 = await insert(coord.token, 'shifts', {
  opportunity_id: oppA, org_id: orgB, starts_at: inHours(400), ends_at: inHours(401), capacity: 1,
});
t.check('L15', 'coordinator cannot create a shift for another org', !c5.ok, c5);
const c6 = await select(coord.token, 'audit_logs?select=id');
t.check('L16', 'coordinator (not org admin) reads no audit log rows', c6.ok && c6.data.length === 0, c6);

// ---- org admin: no user enumeration through invites ------------------------------
const reg = await rpc(oadmin.token, 'invite_org_member', { p_org_id: orgA, p_email: email('load01'), p_role: 'coordinator' });
const ghost = await rpc(oadmin.token, 'invite_org_member', { p_org_id: orgA, p_email: `nobody-${runId}@${DOMAIN}`, p_role: 'coordinator' });
const shape = r => r.ok && JSON.stringify(Object.keys(r.data).sort()) + r.data.status;
t.check('L17', 'invite response identical for registered and unregistered email', reg.ok && ghost.ok && shape(reg) === shape(ghost), { reg, ghost });
const oa = await select(oadmin.token, `audit_logs?select=org_id&org_id=not.is.null`);
const ownOrgs = new Set((await select(oadmin.token, `org_members?select=org_id&user_id=eq.${oadmin.id}`)).data?.map(m => m.org_id));
t.check('L18', 'org admin reads only audit rows of own organizations', oa.ok && oa.data.every(r => ownOrgs.has(r.org_id)), oa);

// ---- optional: Founder platform admin --------------------------------------------
if (process.env.FOUNDER_EMAIL && process.env.FOUNDER_PASSWORD) {
  const founder = await signIn(process.env.FOUNDER_EMAIL, process.env.FOUNDER_PASSWORD);
  const f1 = await rpc(founder.token, 'is_platform_admin');
  t.check('L19', 'Founder account is platform admin through the API', f1.ok && f1.data === true, f1);
} else {
  console.log('SKIP  L19   Founder check (FOUNDER_EMAIL/FOUNDER_PASSWORD not set)');
}

// ---- cleanup ---------------------------------------------------------------------
const cl = [];
if (futId) cl.push(await rpc(coord.token, 'cancel_shift', { p_shift_id: futId, p_reason: `automated test cleanup ${runId}` }));
for (const r of [reg, ghost]) if (r.ok) cl.push(await rpc(oadmin.token, 'revoke_org_invite', { p_invite_id: r.data.invite_id }));
t.check('CLEAN', 'test shift cancelled and test invites revoked', cl.every(r => r.ok), cl);
t.done();
