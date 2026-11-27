/**
 * Mocked Supabase Auth scenarios for the code-first verification and the
 * password-recovery landing. No network, no real email, no real codes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  resend: vi.fn(),
  signUp: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: auth.verifyOtp, resend: auth.resend, signUp: auth.signUp,
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  },
}))

import { AuthProvider, useAuth } from './AuthProvider'
import { recoveryLandingPath, RESET_PATH } from '../lib/authRedirect'
import { cooldownLeft, RESEND_COOLDOWN_SECONDS } from '../lib/otp'

type Api = ReturnType<typeof useAuth>
function getApi(): Api {
  let api: Api | null = null
  function Probe() { api = useAuth(); return null }
  renderToStaticMarkup(<AuthProvider><Probe /></AuthProvider>)
  if (!api) throw new Error('no auth api')
  return api
}

// The exact error shape Supabase Auth returns for a wrong, expired or already-used code.
const supabaseOtpError = { name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }

describe('email verification with a 6-digit code (mocked Supabase)', () => {
  beforeEach(() => { auth.verifyOtp.mockReset(); auth.resend.mockReset() })

  it('success: verifies with the sign-up OTP type and the exact code', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null })
    await expect(getApi().verifySignupCode('v@example.org', '123456')).resolves.toBeUndefined()
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'v@example.org', token: '123456', type: 'email' })
  })

  for (const scenario of ['invalid', 'expired', 'already used']) {
    it(`${scenario} code: rejected with the clear "incorrect or expired" message`, async () => {
      auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: supabaseOtpError })
      await expect(getApi().verifySignupCode('v@example.org', '000000')).rejects.toMatchObject({ code: 'AUTH_OTP_INVALID' })
    })
  }

  it('reused code: a second attempt with the same code is rejected by the server, not accepted twice', async () => {
    auth.verifyOtp
      .mockResolvedValueOnce({ data: { session: {} }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: supabaseOtpError })
    const api = getApi()
    await expect(api.verifySignupCode('v@example.org', '654321')).resolves.toBeUndefined()
    await expect(api.verifySignupCode('v@example.org', '654321')).rejects.toMatchObject({ code: 'AUTH_OTP_INVALID' })
  })

  it('resend: uses the sign-up type and surfaces Supabase rate limits', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.test' } })
    auth.resend.mockResolvedValueOnce({ error: null })
    await getApi().resendConfirmation('v@example.org')
    expect(auth.resend.mock.calls[0][0]).toMatchObject({ type: 'signup', email: 'v@example.org' })
    auth.resend.mockResolvedValueOnce({ error: { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' } })
    await expect(getApi().resendConfirmation('v@example.org')).rejects.toMatchObject({ code: 'AUTH_RATE_LIMIT' })
  })

  it('resend cooldown is 60 seconds', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60)
    expect(cooldownLeft(1_000, 1_000)).toBe(60)
    expect(cooldownLeft(1_000, 61_000)).toBe(0)
  })
})

describe('password recovery landing', () => {
  it('sends a recovery link that fell back to the Site URL root to the reset form', () => {
    expect(recoveryLandingPath('/', '#access_token=x&refresh_token=y&type=recovery')).toBe(RESET_PATH)
  })
  it('leaves the reset page itself alone', () => {
    expect(recoveryLandingPath('/auth/reset', '#access_token=x&type=recovery')).toBeNull()
  })
  it('ignores sign-up confirmations, ordinary pages and a bare type flag', () => {
    expect(recoveryLandingPath('/', '#access_token=x&type=signup')).toBeNull()
    expect(recoveryLandingPath('/explore', '')).toBeNull()
    expect(recoveryLandingPath('/', '#type=recovery')).toBeNull()
  })
})
