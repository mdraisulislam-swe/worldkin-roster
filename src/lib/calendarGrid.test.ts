import { describe, expect, it } from 'vitest'
import { dayKey, hoursByMonth, indexByDay, monthGrid } from './calendarGrid'

describe('month grid', () => {
  it('starts on the Monday on or before the 1st and covers 6 weeks', () => {
    const g = monthGrid(new Date(2026, 10, 15)) // November 2026; 1 Nov is a Sunday
    expect(g).toHaveLength(42)
    expect(g[0].getDay()).toBe(1)
    expect(dayKey(g[0])).toBe('2026-10-26')
    expect(g.some((d) => dayKey(d) === '2026-11-30')).toBe(true)
  })
  it('indexes items by local day', () => {
    const m = indexByDay([{ at: new Date(2026, 10, 26, 9).toISOString() }, { at: new Date(2026, 10, 26, 18).toISOString() }], (x) => x.at)
    expect(m.get('2026-11-26')).toHaveLength(2)
  })
})

describe('verified hours by month', () => {
  it('zero-fills months and sums hours into the right month', () => {
    const now = new Date(2026, 10, 26).getTime()
    const b = hoursByMonth([
      { hours: 3, when: new Date(2026, 10, 2).toISOString() },
      { hours: '2.5', when: new Date(2026, 10, 9).toISOString() },
      { hours: 4, when: new Date(2026, 8, 20).toISOString() },
      { hours: 9, when: new Date(2025, 0, 1).toISOString() }, // outside the window
    ], now, 6)
    expect(b).toHaveLength(6)
    expect(b[5].hours).toBe(5.5)
    expect(b[3].hours).toBe(4)
    expect(b.reduce((s, x) => s + x.hours, 0)).toBe(9.5)
  })
})
