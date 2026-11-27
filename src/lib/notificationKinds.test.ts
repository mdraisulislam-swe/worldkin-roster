import { describe, expect, it } from 'vitest'
import { PIN_CLASS, notificationPin } from './notificationKinds'

// Kinds inserted by the database functions (supabase/migrations, wk04/wk06).
const DB_KINDS = ['offer_new', 'offer_accepted', 'offer_declined', 'offer_revoked', 'application_new', 'application_review',
  'application_rejected', 'application_withdrawn', 'waitlist_promoted', 'signup_cancelled', 'hours_verified', 'feedback_new',
  'complaint_update', 'org_status', 'opportunity_moderated', 'account_status']

describe('notification row icons (prototype C07)', () => {
  it('every kind the database sends has its own icon (not the fallback bell)', () => {
    for (const k of DB_KINDS) expect(notificationPin(k)[0], k).not.toBe('bell')
  })
  it('unknown kinds fall back to a neutral bell', () => {
    expect(notificationPin('something_new')).toEqual(['bell', 'grey'])
  })
  it('every tone has a style', () => {
    for (const k of [...DB_KINDS, 'x']) expect(PIN_CLASS[notificationPin(k)[1]]).toBeTruthy()
  })
})

import { timeAgo } from './format'
describe('relative notification times (prototype C07)', () => {
  const now = new Date(2026, 10, 27, 15, 0).getTime()
  const at = (d: Date) => d.toISOString()
  it('formats recent times', () => {
    expect(timeAgo(at(new Date(now - 20_000)), now)).toBe('just now')
    expect(timeAgo(at(new Date(now - 10 * 60_000)), now)).toBe('10 min ago')
    expect(timeAgo(at(new Date(now - 3 * 3_600_000)), now)).toBe('3 h ago')
    expect(timeAgo(at(new Date(2026, 10, 26, 18, 0)), now)).toBe('Yesterday')
    expect(timeAgo(at(new Date(2026, 10, 23, 9, 0)), now)).toBe('4 days ago')
  })
  it('older items show a date', () => {
    expect(timeAgo(at(new Date(2026, 9, 1, 9, 0)), now)).toMatch(/2026/)
  })
})
