import { describe, expect, it } from 'vitest'
import { API_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, TimeoutError, makeTimeoutFetch, timeoutFor } from './net'
import { toAppError } from './errors'

// A fetch that never answers unless aborted (simulates a hung provider).
const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
})

describe('request timeouts', () => {
  it('picks a longer timeout for storage uploads', () => {
    expect(timeoutFor('https://x.supabase.co/auth/v1/token')).toBe(API_TIMEOUT_MS)
    expect(timeoutFor('https://x.supabase.co/storage/v1/object/avatars/a.png')).toBe(UPLOAD_TIMEOUT_MS)
  })
  it('aborts a hung request and reports a TimeoutError (no retry)', async () => {
    let calls = 0
    const f = makeTimeoutFetch((i, init) => { calls++; return hanging(i, init) }, () => 30)
    await expect(f('https://x.supabase.co/auth/v1/signup')).rejects.toBeInstanceOf(TimeoutError)
    expect(calls).toBe(1)
  })
  it('keeps the caller’s own cancellation working', async () => {
    const f = makeTimeoutFetch(hanging, () => 10_000)
    const c = new AbortController()
    const p = f('https://x.supabase.co/rest/v1/x', { signal: c.signal })
    c.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('passes successful responses through unchanged', async () => {
    const f = makeTimeoutFetch(async () => new Response('ok', { status: 200 }), () => 1000)
    expect(await (await f('https://x.supabase.co/rest/v1/x')).text()).toBe('ok')
  })
})

describe('graceful messages for provider failures', () => {
  it('timeout', () => expect(toAppError(new TimeoutError(15000)).code).toBe('TIMEOUT'))
  it('HTTP 429 rate limit', () => {
    expect(toAppError({ message: 'Request rate limit reached', status: 429 }).code).toBe('AUTH_RATE_LIMIT')
    expect(toAppError({ message: 'x', code: 'over_email_send_rate_limit', status: 429 }).code).toBe('AUTH_RATE_LIMIT')
  })
  it('email provider (SMTP) failure', () => {
    const e = toAppError({ message: 'Error sending confirmation email', status: 500 })
    expect(e.code).toBe('EMAIL_DELIVERY')
    expect(e.retryable).toBe(true)
  })
  it('temporary 5xx service error', () => expect(toAppError({ message: 'upstream error', status: 503 }).code).toBe('SERVICE_UNAVAILABLE'))
  it('offline / DNS failure', () => expect(toAppError(new TypeError('Failed to fetch')).code).toBe('NETWORK'))
  it('business-rule errors stay definitive (not retried)', () => expect(toAppError({ message: 'WK_SHIFT_FULL' }).retryable).toBe(false))
})
