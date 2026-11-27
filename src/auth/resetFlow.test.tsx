/**
 * Password-reset flow states and rules (mocked auth, no network, no email).
 * The live link-to-form path is covered by recoveryLandingPath (authFlows.test.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'

const auth = vi.hoisted(() => ({ value: { loading: false, session: null as unknown } }))
vi.mock('./AuthProvider', () => ({ useAuth: () => auth.value }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }))

import { ResetPasswordPage } from '../pages/AuthPages'
import { newPasswordErrors, readAuthRedirectError, recoveryLandingPath, RESET_PATH } from '../lib/authRedirect'

function renderReset(hash = '') {
  vi.stubGlobal('window', { location: { hash, search: '', pathname: RESET_PATH }, history: { replaceState: () => {}, state: null } })
  return renderToStaticMarkup(<MemoryRouter initialEntries={[RESET_PATH]}><ResetPasswordPage /></MemoryRouter>)
}
afterEach(() => { vi.unstubAllGlobals(); auth.value = { loading: false, session: null } })

describe('new password rules', () => {
  it('weak: under 8 characters', () => expect(newPasswordErrors('short', 'short').password).toMatch(/at least 8/))
  it('too long: over 72 characters (bcrypt limit)', () => expect(newPasswordErrors('a'.repeat(73), 'a'.repeat(73)).password).toMatch(/too long/))
  it('only spaces is rejected', () => expect(newPasswordErrors('        ', '        ').password).toMatch(/spaces/))
  it('mismatch', () => expect(newPasswordErrors('correct horse 1', 'correct horse 2').confirm).toMatch(/do not match/))
  it('valid and matching: no errors', () => expect(newPasswordErrors('correct horse 1', 'correct horse 1')).toEqual({}))
})

describe('reset page states', () => {
  it('expired or already-used link: explains and offers a new link (no form)', () => {
    const html = renderReset('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    expect(html).toContain('expired or was already used')
    expect(html).toContain('href="/forgot-password"')
    expect(html).not.toContain('name="password"')
  })
  it('invalid token (any auth error in the link) is treated the same way', () => {
    expect(readAuthRedirectError('#error=server_error&error_code=bad_jwt&error_description=invalid', '')).not.toBeNull()
  })
  it('missing recovery session: asks to open the email link (no form)', () => {
    const html = renderReset()
    expect(html).toContain('Open the reset link from your email')
    expect(html).not.toContain('name="password"')
  })
  it('while the session is being checked: loading state, no form', () => {
    auth.value = { loading: true, session: null }
    expect(renderReset()).not.toContain('name="password"')
  })
  it('with the recovery session: new password + confirm fields', () => {
    auth.value = { loading: false, session: { user: { id: 'u1' } } }
    const html = renderReset()
    expect(html).toContain('name="password"')
    expect(html).toContain('name="confirm"')
    expect(html).toMatch(/autocomplete="new-password"/i)
  })
})

describe('wrong-domain landing', () => {
  it('a recovery link that falls back to the Site URL root still reaches the reset form', () => {
    expect(recoveryLandingPath('/', '#access_token=x&refresh_token=y&type=recovery')).toBe(RESET_PATH)
  })
  it('an expired recovery link on the root also reaches the reset page (which explains it)', () => {
    expect(recoveryLandingPath('/', '#error=access_denied&error_code=otp_expired&type=recovery')).toBe(RESET_PATH)
  })
})
