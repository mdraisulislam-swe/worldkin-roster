import { describe, expect, it } from 'vitest'
import { eventTitle, getEvent, isUuid, splitByTime, type PublicEvent } from './events'

const ev = (id: string, start: string, end: string, title: string | null = null): PublicEvent => ({
  id, title, starts_at: start, ends_at: end, capacity: 5, opportunity_id: 'o',
  opportunities: { id: 'o', title: 'Parcel packing', description: '', cause: 'food_security', mode: 'onsite', city: null, country_code: 'BD',
    compensation_type: 'voluntary', selection_mode: 'open', org_id: 'g', organizations: null },
})

describe('public events', () => {
  const now = Date.parse('2026-11-26T12:00:00Z')
  it('separates ongoing from upcoming and drops finished events', () => {
    const { ongoing, upcoming } = splitByTime([
      ev('a', '2026-11-26T10:00:00Z', '2026-11-26T14:00:00Z'),
      ev('b', '2026-11-27T10:00:00Z', '2026-11-27T12:00:00Z'),
      ev('c', '2026-11-25T10:00:00Z', '2026-11-25T12:00:00Z'),
    ], now)
    expect(ongoing.map((e) => e.id)).toEqual(['a'])
    expect(upcoming.map((e) => e.id)).toEqual(['b'])
  })
  it('uses the shift title when set, else the opportunity title', () => {
    expect(eventTitle(ev('a', '', '', 'Morning shift'))).toBe('Morning shift')
    expect(eventTitle(ev('a', '', '', '  '))).toBe('Parcel packing')
  })
})

describe('event ids', () => {
  it('treats malformed ids as not found without calling the API', async () => {
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('3a5fe4b3-6a05-4f2f-946d-ac24a30ddf63')).toBe(true)
    await expect(getEvent('not-a-uuid')).resolves.toBeNull()
  })
})
