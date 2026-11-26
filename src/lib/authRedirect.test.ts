import { describe, expect, it } from 'vitest'
import { authRedirectMessage, confirmationRedirectUrl, hasAuthFragment, readAuthRedirectError, safeNext } from './authRedirect'

const ORIGIN = 'https://worldkin-roster.vercel.app'

describe('email confirmation redirect', () => {
  it('points the email link at the production confirmation page', () => {
    expect(confirmationRedirectUrl(ORIGIN)).toBe(`${ORIGIN}/auth/confirmed`)
    expect(confirmationRedirectUrl(ORIGIN, '/opportunities/abc')).toBe(`${ORIGIN}/auth/confirmed?next=%2Fopportunities%2Fabc`)
  })
  it('never redirects off-site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', null, ''])
      expect(safeNext(bad)).toBe('/me')
    expect(confirmationRedirectUrl(ORIGIN, '//evil.example')).toBe(`${ORIGIN}/auth/confirmed`)
  })
  it('reads expired / already-used link errors from the fragment', () => {
    const err = readAuthRedirectError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '')
    expect(err).toEqual({ code: 'otp_expired', description: 'Email link is invalid or has expired' })
    expect(authRedirectMessage(err!).canResend).toBe(true)
    expect(authRedirectMessage(err!).title).toMatch(/expired or was already used/)
  })
  it('ignores a successful fragment and normal URLs', () => {
    expect(readAuthRedirectError('#access_token=x&refresh_token=y&type=signup', '')).toBeNull()
    expect(readAuthRedirectError('', '?next=/me')).toBeNull()
  })
  it('detects auth data that must be removed from the address bar', () => {
    expect(hasAuthFragment('#access_token=abc&type=signup')).toBe(true)
    expect(hasAuthFragment('#error_code=otp_expired')).toBe(true)
    expect(hasAuthFragment('#main')).toBe(false)
  })
})

describe('sign-in return path keeps the query string', () => {
  it('allows a same-site path with a query', () => {
    expect(safeNext('/me/complaints?org=a&opportunity=b')).toBe('/me/complaints?org=a&opportunity=b')
  })
  it('still refuses other sites', () => {
    expect(safeNext('//evil.example/?x=1')).toBe('/me')
    expect(safeNext('https://evil.example/me')).toBe('/me')
  })
})
