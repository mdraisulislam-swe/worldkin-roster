/**
 * Helpers for the 6-digit email verification step (pure; unit-tested).
 * The code itself is generated, delivered and validated only by Supabase Auth;
 * nothing here stores, logs or checks the code's value.
 */

export const OTP_LENGTH = 6
export const RESEND_COOLDOWN_SECONDS = 60

/** Keeps digits only (users paste "123 456", "123-456" or the whole sentence). */
export function normalizeOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export const isCompleteOtp = (code: string) => /^\d{6}$/.test(code)

/** Whole seconds left before another code may be requested (UI courtesy; Supabase enforces real limits). */
export function cooldownLeft(lastSentAt: number | null, now: number, seconds = RESEND_COOLDOWN_SECONDS): number {
  if (!lastSentAt) return 0
  return Math.max(0, Math.ceil((lastSentAt + seconds * 1000 - now) / 1000))
}

export type PendingSignup = { email: string; name?: string; next: string; sentAt: number }
const KEY = 'wk_pending_signup'

/** Remembered in this tab only (sessionStorage), never in the URL. */
export function savePendingSignup(p: PendingSignup) {
  try { sessionStorage.setItem(KEY, JSON.stringify(p)) } catch { /* storage unavailable: page still works via router state */ }
}
export function readPendingSignup(): PendingSignup | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PendingSignup | null
    return v && typeof v.email === 'string' && typeof v.next === 'string' ? v : null
  } catch { return null }
}
export function clearPendingSignup() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Masks an address for display: amina.c@example.org → am•••••@example.org */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return email
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`
}
