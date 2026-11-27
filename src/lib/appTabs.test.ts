import { describe, expect, it } from 'vitest'
import { APP_TABS, appTabOf } from './appTabs'
import type { MyApplication } from './platform'

const app = (p: Partial<MyApplication>) => ({ status: 'submitted', offer_status: null, ...p }) as MyApplication

describe('applications tabs (prototype C02)', () => {
  it('has the prototype tabs in order', () => {
    expect(APP_TABS.map((t) => t.label)).toEqual(['All', 'Pending', 'Offers', 'Accepted', 'Not selected', 'Withdrawn'])
  })
  it('groups every status into exactly one tab', () => {
    expect(appTabOf(app({ status: 'submitted' }))).toBe('pending')
    expect(appTabOf(app({ status: 'under_review' }))).toBe('pending')
    expect(appTabOf(app({ status: 'selected', offer_status: 'pending' }))).toBe('offers')
    expect(appTabOf(app({ status: 'selected', offer_status: 'accepted' }))).toBe('accepted')
    expect(appTabOf(app({ status: 'rejected' }))).toBe('not_selected')
    expect(appTabOf(app({ status: 'withdrawn' }))).toBe('withdrawn')
    expect(appTabOf(app({ status: 'declined' }))).toBe('withdrawn')
    expect(appTabOf(app({ status: 'expired' }))).toBe('withdrawn')
  })
})
