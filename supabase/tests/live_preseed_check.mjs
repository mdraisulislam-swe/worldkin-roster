// =============================================================================
// Worldkin Roster — live A03 checks that need NO seed data and perform NO writes
// (every write attempt here is expected to be rejected by the database).
// Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_PASSWORD or TEST_PASSWORD_FILE
// Run: node supabase/tests/live_preseed_check.mjs
// =============================================================================
import { requireEnv, email, signIn, rpc, select, insert, patch, reporter } from './lib/api.mjs'

requireEnv()
const t = reporter('A03 pre-seed checks (live, no writes)')
const ZERO = '00000000-0000-4000-8000-000000000000'

// P0: every test account can sign in (proves confirmed email + password)
const names = ['demo.orgadmin', 'demo.coordinator', 'demo.volunteer1', 'demo.volunteer2',
  ...Array.from({ length: 10 }, (_, i) => `load${String(i + 1).padStart(2, '0')}`)]
const sessions = await Promise.allSettled(names.map((n) => signIn(email(n))))
const okCount = sessions.filter((s) => s.status === 'fulfilled').length
t.check('P0', `all 14 test accounts sign in (${okCount}/14)`, okCount === 14, sessions.filter((s) => s.status === 'rejected').map((s) => String(s.reason)))
const vol = sessions[2].status === 'fulfilled' ? sessions[2].value : null
if (!vol) { console.error('volunteer sign-in failed; stopping'); t.done() }

const a1 = await select(null, 'signups?select=id')
t.check('L1', 'anon cannot read signups', !a1.ok && a1.code === '42501', a1)
const a2 = await select(null, 'profiles?select=id')
t.check('L2', 'anon cannot read profiles', !a2.ok && a2.code === '42501', a2)
const a3 = await select(null, 'opportunities?select=id,is_sensitive,status')
t.check('L3', 'anon sees only published, non-sensitive opportunities (none before seed)', a3.ok && a3.data.every((o) => o.status === 'published' && !o.is_sensitive), a3)
const a4 = await select(null, 'audit_logs?select=id')
t.check('L3b', 'anon cannot read audit logs', !a4.ok, a4)

const v1 = await patch(vol.token, `profiles?id=eq.${vol.id}`, { platform_role: 'platform_admin' })
t.check('L4', 'volunteer cannot set own platform_role', !v1.ok && v1.code === '42501', v1)
const v2 = await insert(vol.token, 'signups', {
  shift_id: ZERO, org_id: ZERO, volunteer_id: vol.id, status: 'confirmed',
  slot: '[2030-01-01T00:00:00Z,2030-01-01T01:00:00Z)', idempotency_key: ZERO,
})
t.check('L5', 'volunteer cannot insert signups directly', !v2.ok && v2.code === '42501', v2)
const v3 = await rpc(vol.token, 'review_organization', { p_org_id: ZERO, p_decision: 'verified' })
t.check('L6', 'volunteer cannot review organizations', !v3.ok && v3.msg === 'WK_FORBIDDEN', v3)
const v4 = await rpc(vol.token, '_promote_waitlist', { p_shift_id: ZERO })
t.check('L7', 'internal function _promote_waitlist is not callable', !v4.ok, v4)
const v5 = await select(vol.token, 'signups?select=volunteer_id')
t.check('L8', 'volunteer sees only own signups', v5.ok && v5.data.every((s) => s.volunteer_id === vol.id), v5)
const v6 = await select(vol.token, 'audit_logs?select=id')
t.check('L9', 'volunteer reads no audit log rows', v6.ok && v6.data.length === 0, v6)
const v7 = await rpc(vol.token, 'is_platform_admin')
t.check('L10', 'volunteer is not a platform admin', v7.ok && v7.data === false, v7)
const v8 = await select(vol.token, 'profiles?select=id')
t.check('L10b', 'volunteer sees only own profile', v8.ok && v8.data.length === 1 && v8.data[0].id === vol.id, v8)
const v9 = await rpc(vol.token, '_is_api_request')
t.check('L10c', 'internal function _is_api_request is not callable', !v9.ok, v9)
const v10 = await patch(vol.token, `profiles?id=neq.${vol.id}`, { full_name: 'hacked' })
t.check('L10d', "volunteer cannot edit other users' profiles (0 rows)", v10.ok && v10.data.length === 0, v10)
const v11 = await insert(vol.token, 'audit_logs', { action: 'forged', entity_type: 'x' })
t.check('L10e', 'volunteer cannot forge audit log entries', !v11.ok && v11.code === '42501', v11)
t.done()
