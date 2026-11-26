import { describe, expect, it } from 'vitest'
import { cooldownLeft, isCompleteOtp, maskEmail, normalizeOtp } from './otp'
import { toAppError } from './errors'

describe('email verification code helpers', () => {
  it('keeps only digits and at most 6 of them (paste-friendly)', () => {
    expect(normalizeOtp('123 456')).toBe('123456')
    expect(normalizeOtp('Your code: 987-654.')).toBe('987654')
    expect(normalizeOtp('1234567890')).toBe('123456')
    expect(normalizeOtp('abc')).toBe('')
  })
  it('accepts only complete 6-digit codes', () => {
    expect(isCompleteOtp('123456')).toBe(true)
    expect(isCompleteOtp('12345')).toBe(false)
    expect(isCompleteOtp('12345a')).toBe(false)
  })
  it('60-second resend cooldown counts down and never goes negative', () => {
    const t0 = 1_000_000
    expect(cooldownLeft(null, t0)).toBe(0)
    expect(cooldownLeft(t0, t0)).toBe(60)
    expect(cooldownLeft(t0, t0 + 59_100)).toBe(1)
    expect(cooldownLeft(t0, t0 + 60_000)).toBe(0)
    expect(cooldownLeft(t0, t0 + 999_999)).toBe(0)
  })
  it('masks the address shown on screen', () => {
    expect(maskEmail('amina.c@example.org')).toBe('am•••••@example.org')
    expect(maskEmail('ab@x.io')).toBe('ab•@x.io')
  })
  it('maps Supabase invalid/expired code errors to one clear message', () => {
    expect(toAppError({ message: 'Token has expired or is invalid', code: 'otp_expired' }).code).toBe('AUTH_OTP_INVALID')
    expect(toAppError({ message: 'Token has expired or is invalid' }).code).toBe('AUTH_OTP_INVALID')
    expect(toAppError({ message: 'Email not confirmed' }).code).toBe('AUTH_UNCONFIRMED')
    expect(toAppError({ message: 'Invalid login credentials' }).code).toBe('AUTH_INVALID')
  })
})
