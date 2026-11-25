import { describe, expect, it } from 'vitest'
import { AppError, WK_MESSAGES, toAppError } from './errors'
import { IdempotencyKeys } from './idempotency'
import { parseEnv, WORLDKIN_SUPABASE_URL } from './env'
import { opportunitySchema, organizationSchema, profileSchema, shiftSchema, signUpSchema, inviteSchema, fieldErrors } from './validation'
import { shiftHours, slugify } from './format'

describe('toAppError — database error mapping', () => {
  it('maps every WK_ code raised by the database to a user message', () => {
    for (const code of Object.keys(WK_MESSAGES)) {
      const e = toAppError({ message: code, code: 'P0001' })
      expect(e.code).toBe(code)
      expect(e.message).toBe(WK_MESSAGES[code])
      expect(e.retryable).toBe(false)
    }
  })
  it('finds a WK_ code embedded in a longer message', () => {
    expect(toAppError({ message: 'ERROR: WK_SHIFT_FULL (capacity=1)' }).code).toBe('WK_SHIFT_FULL')
  })
  it('maps SQLSTATE permission errors (RLS / column privileges)', () => {
    const e = toAppError({ message: 'permission denied for table signups', code: '42501' })
    expect(e.message).toMatch(/permission/i)
  })
  it('treats network failures as retryable', () => {
    const e = toAppError(new TypeError('Failed to fetch'))
    expect(e.code).toBe('NETWORK')
    expect(e.retryable).toBe(true)
  })
  it('passes AppError through unchanged', () => {
    const original = new AppError('x', 'Y')
    expect(toAppError(original)).toBe(original)
  })
})

describe('IdempotencyKeys — A05 join retries', () => {
  it('reuses the same key for retries of the same intent', () => {
    let n = 0
    const keys = new IdempotencyKeys(() => `k${++n}`)
    expect(keys.keyFor('shift-1')).toBe('k1')
    expect(keys.keyFor('shift-1')).toBe('k1') // retry / double click
    expect(keys.keyFor('shift-2')).toBe('k2') // different shift, different key
  })
  it('issues a fresh key after a definitive answer', () => {
    let n = 0
    const keys = new IdempotencyKeys(() => `k${++n}`)
    keys.keyFor('s')
    keys.release('s')
    expect(keys.keyFor('s')).toBe('k2')
  })
})

describe('parseEnv — Worldkin isolation guard', () => {
  const key = 'sb_publishable_0123456789abcdefghij'
  it('accepts only the Worldkin project URL', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: WORLDKIN_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: key }).ok).toBe(true)
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://other-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key }).ok).toBe(false)
  })
  it('rejects a secret key in the browser', () => {
    const r = parseEnv({ VITE_SUPABASE_URL: WORLDKIN_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_0123456789abcdefghij' })
    expect(r.ok).toBe(false)
  })
  it('reports missing configuration', () => {
    expect(parseEnv({}).ok).toBe(false)
  })
})

describe('validation mirrors database constraints', () => {
  it('sign-up requires 8+ character passwords', () => {
    expect(signUpSchema.safeParse({ fullName: 'A', email: 'a@b.co', password: 'short' }).success).toBe(false)
    expect(signUpSchema.safeParse({ fullName: 'A', email: 'a@b.co', password: 'long-enough' }).success).toBe(true)
  })
  it('profile: skills are trimmed, de-duplicated and limited to 20', () => {
    const ok = profileSchema.parse({ full_name: 'Amina', country_code: 'bd', city: '', bio: '', skills: 'first aid, logistics, first aid' })
    expect(ok.skills).toEqual(['first aid', 'logistics'])
    expect(ok.country_code).toBe('BD')
    expect(ok.city).toBeNull()
    const many = Array.from({ length: 21 }, (_, i) => `s${i}`).join(',')
    expect(profileSchema.safeParse({ full_name: 'A', country_code: '', city: '', bio: '', skills: many }).success).toBe(false)
  })
  it('organization slug follows the database pattern', () => {
    const base = { name: 'Relief', cause: 'health', country_code: 'BD', description: '', website: '' }
    expect(organizationSchema.safeParse({ ...base, slug: 'relief-one' }).success).toBe(true)
    expect(organizationSchema.safeParse({ ...base, slug: 'Bad Slug!' }).success).toBe(false)
    expect(organizationSchema.safeParse({ ...base, slug: 'ok', website: 'ftp://x' }).success).toBe(false)
  })
  it('opportunity: on-site needs a country; skill match needs listed skills', () => {
    const base = {
      title: 'Food drive', description: 'Pack food parcels for families', cause: 'food_security', city: '', requirements: '',
      is_sensitive: false,
    }
    expect(opportunitySchema.safeParse({ ...base, mode: 'onsite', country_code: '', skills_wanted: '', requires_skill_match: false }).success).toBe(false)
    expect(opportunitySchema.safeParse({ ...base, mode: 'remote', country_code: '', skills_wanted: '', requires_skill_match: false }).success).toBe(true)
    const r = opportunitySchema.safeParse({ ...base, mode: 'remote', country_code: '', skills_wanted: '', requires_skill_match: true })
    expect(r.success).toBe(false)
    if (!r.success) expect(fieldErrors(r.error).skills_wanted).toBeDefined()
  })
  it('shift: future start, end after start, max 24h, capacity 1..500', () => {
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
    const ok = { title: '', starts_at: at(24), ends_at: at(27), capacity: '5', waitlist_limit: '2' }
    expect(shiftSchema.safeParse(ok).success).toBe(true)
    expect(shiftSchema.safeParse({ ...ok, starts_at: at(-1) }).success).toBe(false)
    expect(shiftSchema.safeParse({ ...ok, ends_at: at(23) }).success).toBe(false)
    expect(shiftSchema.safeParse({ ...ok, ends_at: at(49) }).success).toBe(false)
    expect(shiftSchema.safeParse({ ...ok, capacity: '0' }).success).toBe(false)
    expect(shiftSchema.safeParse({ ...ok, capacity: '501' }).success).toBe(false)
  })
  it('invite: valid email and role only', () => {
    expect(inviteSchema.safeParse({ email: 'A@B.CO ', role: 'coordinator' }).data?.email).toBe('a@b.co')
    expect(inviteSchema.safeParse({ email: 'nope', role: 'coordinator' }).success).toBe(false)
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'platform_admin' }).success).toBe(false)
  })
})

describe('format helpers', () => {
  it('slugify produces database-valid slugs', () => {
    expect(slugify('Dhaka Food Relief Network!')).toBe('dhaka-food-relief-network')
    expect(slugify('  --Hello__World--  ')).toBe('hello-world')
  })
  it('shiftHours rounds to 2 decimals', () => {
    expect(shiftHours('2026-01-01T09:00:00Z', '2026-01-01T13:30:00Z')).toBe(4.5)
  })
})
