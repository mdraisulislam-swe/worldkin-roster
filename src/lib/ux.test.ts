import { describe, expect, it } from 'vitest'
import { buildIcs } from './calendar'
import { matchingSkills, seatsSummary, spotsLabel, startsIn } from './format'

describe('buildIcs — add to calendar', () => {
  const ics = buildIcs(
    { uid: 'shift-1', title: 'Food drive, Dhaka; team A', startsAt: '2026-11-28T03:00:00Z', endsAt: '2026-11-28T07:00:00Z', description: 'Line one\nLine two' },
    new Date('2026-11-25T00:00:00Z'),
  )
  it('produces a valid VEVENT with UTC times and CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20261128T030000Z\r\n')
    expect(ics).toContain('DTEND:20261128T070000Z\r\n')
    expect(ics).toContain('UID:shift-1@worldkin-roster\r\n')
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })
  it('escapes RFC 5545 special characters', () => {
    expect(ics).toContain('SUMMARY:Food drive\\, Dhaka\\; team A')
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two')
  })
})

describe('listing helpers', () => {
  const now = new Date('2026-11-25T10:00:00').getTime()
  it('startsIn uses calendar days', () => {
    expect(startsIn(new Date('2026-11-25T18:00:00').toISOString(), now)).toBe('Today')
    expect(startsIn(new Date('2026-11-26T08:00:00').toISOString(), now)).toBe('Tomorrow')
    expect(startsIn(new Date('2026-11-30T08:00:00').toISOString(), now)).toBe('In 5 days')
  })
  it('spotsLabel flags scarcity and full shifts only', () => {
    expect(spotsLabel(2, 1)).toEqual({ text: 'Only 2 spots left', tone: 'warn' })
    expect(spotsLabel(1, 1)?.text).toBe('Only 1 spot left')
    expect(spotsLabel(0, 2)?.tone).toBe('muted')
    expect(spotsLabel(10, 2)).toBeNull()
    expect(spotsLabel(0, 0)).toBeNull()
  })
  it('matchingSkills is case- and whitespace-insensitive (same rule as join_shift)', () => {
    expect(matchingSkills(['First Aid ', 'cooking'], ['first aid', 'logistics'])).toEqual(['first aid'])
    expect(matchingSkills([], ['logistics'])).toEqual([])
  })
})

describe('seat summary on opportunity cards', () => {
  it('states open seats and upcoming shifts from real counts only', () => {
    expect(seatsSummary(5, 2)).toBe('5 open seats · 2 upcoming shifts')
    expect(seatsSummary(1, 1)).toBe('1 open seat · 1 upcoming shift')
    expect(seatsSummary(0, 3)).toBe('No open seats · 3 upcoming shifts')
    expect(seatsSummary(0, 0)).toBeNull()
  })
})
