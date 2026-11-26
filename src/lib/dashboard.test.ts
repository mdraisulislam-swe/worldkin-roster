import { describe, expect, it } from 'vitest'
import { dashboardPath, firstName, groupByDay, profileCompletion, summarizeApplications } from './dashboard'
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

describe('dashboard destination', () => {
  it('lets staff of several organizations choose instead of opening the first one', () => {
    expect(dashboardPath({ isPlatformAdmin: false, orgIds: ['a', 'b'] })).toBe('/orgs')
    expect(dashboardPath({ isPlatformAdmin: false, orgIds: ['a'] })).toBe('/org/a')
  })
  it('keeps admin, new-organization and volunteer routing', () => {
    expect(dashboardPath({ isPlatformAdmin: true, orgIds: ['a', 'b'] })).toBe('/admin')
    expect(dashboardPath({ isPlatformAdmin: false, orgIds: [], signupIntent: 'organization' })).toBe('/orgs/new')
    expect(dashboardPath({ isPlatformAdmin: false, orgIds: [], signupIntent: 'admin' })).toBe('/me')
  })
})

describe('agenda grouping', () => {
  it('groups by local day in time order with Today/Tomorrow labels', () => {
    const now = new Date(2026, 10, 26, 9, 0).getTime()
    const at = (d: number, h: number) => ({ at: new Date(2026, 10, d, h).toISOString() })
    const groups = groupByDay([at(28, 10), at(26, 18), at(27, 8), at(26, 12)], (x) => x.at, now)
    expect(groups.map((g) => g.label.startsWith('Today') || g.label.startsWith('Tomorrow') ? g.label : 'other')).toEqual(['Today', 'Tomorrow', 'other'])
    expect(groups[0].items.map((x) => new Date(x.at).getHours())).toEqual([12, 18])
  })
})
