import { describe, expect, it } from 'vitest'
import { COUNTRY_OPTIONS, COUNTRY_VIEW, countryName, isCountryCode, locate, roundToArea } from './geo'
import { buildMapPoints } from './mapPoints'
import { canTransition, emergencyRequestSchema, NEXT_STATUS } from './emergency'
import { parseVideoUrl } from './video'
import { seatStats } from './seats'
import type { OpportunityCard, OrgCard } from './platform'
import type { PublicEvent } from './events'

describe('geo', () => {
  it('places known cities, including alternative spellings', () => {
    expect(locate('Dhaka', 'BD')).toMatchObject({ precision: 'city', lat: 23.8103 })
    expect(locate('Chittagong', 'BD')).toEqual(locate('Chattogram', 'bd'))
    expect(locate('  sylhet ', 'BD')?.precision).toBe('city')
  })
  it('falls back to the country centre, or nothing', () => {
    expect(locate('Unknown town', 'BD')).toMatchObject({ precision: 'country', lat: COUNTRY_VIEW.BD.lat })
    expect(locate(null, 'XX')).toBeNull()
    expect(locate('Unknown', null)).toBeNull()
  })
  it('lists countries with Bangladesh first and validates codes', () => {
    expect(COUNTRY_OPTIONS[0].value).toBe('BD')
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(190)
    expect(isCountryCode('np')).toBe(true)
    expect(isCountryCode('ZZ')).toBe(false)
    expect(countryName('BD')).toBe('Bangladesh')
  })
  it('rounds coordinates to ~5 km areas', () => {
    expect(roundToArea(23.81034)).toBeCloseTo(23.8, 6)
    expect(roundToArea(90.4125)).toBeCloseTo(90.4, 6)
  })
})

describe('buildMapPoints', () => {
  const opp = (o: Partial<OpportunityCard>) => ({ id: 'o', title: 'T', org_name: 'Org', mode: 'onsite', city: 'Dhaka', country_code: 'BD', ...o }) as OpportunityCard
  const org = (o: Partial<OrgCard>) => ({ id: 'g', name: 'G', slug: 'g', city: 'Sylhet', country_code: 'BD', published_opportunities: 1, ...o }) as OrgCard
  const ev = (city: string | null) => ({ id: 'e', title: null, opportunities: { title: 'Ev', mode: 'onsite', city, country_code: 'BD', organizations: { name: 'Org' } } }) as unknown as PublicEvent

  it('uses only public listings, skips remote ones and counts unplaced', () => {
    const r = buildMapPoints([opp({}), opp({ id: 'r', mode: 'remote' }), opp({ id: 'x', city: 'Nowhere', country_code: null })], [ev('Khulna')], [org({})])
    expect(r.points.map((p) => p.id)).toEqual(['opp:o', 'event:e', 'org:g'])
    expect(r.unplaced).toBe(1)
    expect(r.points[0]).toMatchObject({ href: '/opportunities/o', area: 'Dhaka, Bangladesh', precision: 'city' })
    expect(r.points[2].sub).toBe('1 open opportunity')
  })
})

describe('emergency rules', () => {
  const valid = {
    category: 'flood', title: 'Sandbag team needed', description: 'Help fill and place sandbags along the river barrier this evening.',
    country_code: 'bd', city: 'Sylhet', skills: 'First aid, Driving', volunteers_needed: '8', urgency: 'high', contact_method: 'in_app',
    expires_in_hours: '24', safety_notes: '', not_emergency_service_ack: 'on',
  }
  it('accepts a complete request and normalises it', () => {
    const r = emergencyRequestSchema.parse(valid)
    expect(r.country_code).toBe('BD')
    expect(r.skills).toEqual(['First aid', 'Driving'])
    expect(r.volunteers_needed).toBe(8)
  })
  it('rejects missing acknowledgement, bad numbers and short text', () => {
    const r = emergencyRequestSchema.safeParse({ ...valid, not_emergency_service_ack: undefined, volunteers_needed: '0', expires_in_hours: '100', title: 'x', country_code: 'ZZ' })
    expect(r.success).toBe(false)
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(['not_emergency_service_ack', 'volunteers_needed', 'expires_in_hours', 'title', 'country_code']))
  })
  it('allows only forward transitions; resolved and cancelled are final', () => {
    expect(canTransition('open', 'cancelled')).toBe(true)
    expect(canTransition('resolved', 'open')).toBe(false)
    expect(canTransition('cancelled', 'in_progress')).toBe(false)
    expect(NEXT_STATUS.resolved).toEqual([])
  })
})

describe('video urls', () => {
  it('parses YouTube links into a privacy-enhanced embed', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) {
      expect(parseVideoUrl(u)).toMatchObject({ kind: 'youtube', id: 'dQw4w9WgXcQ', embed: expect.stringContaining('youtube-nocookie.com/embed/dQw4w9WgXcQ') })
    }
  })
  it('accepts https video files and rejects everything else', () => {
    expect(parseVideoUrl('https://cdn.example.org/intro.mp4').kind).toBe('file')
    expect(parseVideoUrl('').kind).toBe('none')
    expect(parseVideoUrl('http://youtu.be/dQw4w9WgXcQ').kind).toBe('invalid')
    expect(parseVideoUrl('https://youtu.be/short').kind).toBe('invalid')
    expect(parseVideoUrl('javascript:alert(1)').kind).toBe('invalid')
    expect(parseVideoUrl('https://example.org/page').kind).toBe('invalid')
  })
})

describe('seatStats', () => {
  it('computes percent, seats left and full', () => {
    expect(seatStats(10, 20)).toEqual({ pct: 50, left: 10, full: false })
    expect(seatStats(11, 20)).toEqual({ pct: 55, left: 9, full: false })
    expect(seatStats(20, 20)).toEqual({ pct: 100, left: 0, full: true })
    expect(seatStats(25, 20)).toEqual({ pct: 100, left: 0, full: true })
  })
})
