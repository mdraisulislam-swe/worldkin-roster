/**
 * Email-confirmation redirect helpers (pure, unit-tested).
 *
 * Supabase sends the user from the confirmation email back to `emailRedirectTo`
 * ONLY if that URL is on the project's Redirect URL allow-list; otherwise it
 * falls back to the Site URL. Tokens arrive in the URL fragment (#...), which
 * browsers never send to a server; supabase-js stores the session and clears
 * the fragment. Errors (expired / already-used link) arrive the same way.
 */

export const CONFIRM_PATH = '/auth/confirmed'

/** Only same-site relative paths (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/me'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}

export function confirmationRedirectUrl(origin: string, next?: string | null): string {
  const target = safeNext(next, '/me')
  return `${origin}${CONFIRM_PATH}${target === '/me' ? '' : `?next=${encodeURIComponent(target)}`}`
}

export type AuthRedirectError = { code: string; description: string }

/** Reads an auth error that Supabase put in the URL fragment or query string. */
export function readAuthRedirectError(hash: string, search: string): AuthRedirectError | null {
  for (const raw of [hash.replace(/^#/, ''), search.replace(/^\?/, '')]) {
    const p = new URLSearchParams(raw)
    const code = p.get('error_code') ?? p.get('error')
    if (code) return { code, description: p.get('error_description') ?? '' }
  }
  return null
}

/** True when the URL still carries auth data that should never stay visible. */
export function hasAuthFragment(hash: string): boolean {
  return /(^|[#&])(access_token|refresh_token|error_code|error)=/.test(hash)
}

export function authRedirectMessage(err: AuthRedirectError): { title: string; message: string; canResend: boolean } {
  if (err.code === 'otp_expired' || /expired|invalid/i.test(err.description)) {
    return {
      title: 'This confirmation link has expired or was already used',
      message: 'If you already confirmed your email, just sign in. Otherwise enter your email below and we will send a new link.',
      canResend: true,
    }
  }
  if (err.code === 'access_denied') {
    return { title: 'Confirmation was not completed', message: 'The link could not be used. Request a new confirmation email below.', canResend: true }
  }
  return { title: 'We could not confirm your email', message: 'Please try again, or request a new confirmation email below.', canResend: true }
}
