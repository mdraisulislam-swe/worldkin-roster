import { describe, expect, it } from 'vitest'
import { firstName, profileCompletion, summarizeApplications } from './dashboard'
import type { MyApplication } from './platform'

const app = (over: Partial<MyApplication>): MyApplication => ({
  application_id: crypto.randomUUID(), opportunity_id: 'o', opportunity_title: 't', org_id: 'g', org_name: 'n',
  status: 'submitted', message: null, decision_reason: null, created_at: '', updated_at: '',
  offer_id: null, offer_status: null, offer_expires_at: null, offer_message: null,
  shift_id: null, shift_title: null, shift_starts_at: null, shift_ends_at: null, signup_id: null, signup_status: null,
  ...over,
})

describe('volunteer dashboard helpers', () => {
  it('counts profile completion from real fields only', () => {
    expect(profileCompletion({}).pct).toBe(0)
    const c = profileCompletion({ bio: 'Hi', skills: ['first aid'], languages: [], city: ' ', availability: 'weekends', avatar_url: null })
    expect(c.done).toBe(3)
    expect(c.missing).toEqual(['Languages', 'City', 'Profile photo'])
  })
  it('groups applications by next action; expired offers are not open offers', () => {
    const now = Date.parse('2026-11-26T12:00:00Z')
    const s = summarizeApplications([
      app({ status: 'submitted' }),
      app({ status: 'under_review' }),
      app({ status: 'selected', offer_status: 'pending', offer_expires_at: '2026-11-27T12:00:00Z' }),
      app({ status: 'selected', offer_status: 'pending', offer_expires_at: '2026-11-25T12:00:00Z' }),
      app({ status: 'selected', offer_status: 'accepted' }),
      app({ status: 'rejected' }),
      app({ status: 'withdrawn' }),
    ], now)
    expect(s).toEqual({ inProgress: 2, offers: 1, accepted: 1, closed: 2 })
  })
  it('extracts a first name safely', () => {
    expect(firstName('  Nadia  Rahman ')).toBe('Nadia')
    expect(firstName(null)).toBe('')
  })
})
