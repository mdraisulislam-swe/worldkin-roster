/**
 * Geography helpers for the public map and country filters.
 *
 * Privacy: the app stores only a city name and a country code for opportunities, events and organizations
 * (no coordinates). Markers are therefore placed at a known city centre (precision "city") or at the
 * country centre (precision "country"). They are approximate areas, never addresses. Volunteer locations
 * are not stored or shown at all (see supabase/proposals/wk12_location_emergency.sql).
 */

/** ISO 3166-1 alpha-2 codes. Names come from the browser (Intl.DisplayNames), so nothing is hand-typed. */
const ISO2 = ('AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN ' +
  'KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL ' +
  'PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU ' +
  'WS XK YE ZA ZM ZW').split(' ')

export function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code } catch { return code }
}

/** Sorted by name; Bangladesh first because most current listings are there. */
export const COUNTRY_OPTIONS: { value: string; label: string }[] = (() => {
  const all = ISO2.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label))
  const bd = all.find((c) => c.value === 'BD')!
  return [bd, ...all.filter((c) => c.value !== 'BD')]
})()

export const isCountryCode = (v: string) => ISO2.includes(v.toUpperCase())

export type LatLngZoom = { lat: number; lng: number; zoom: number }

/** Approximate geographic centres (and a sensible zoom) for countries the map can fly to. */
export const COUNTRY_VIEW: Record<string, LatLngZoom> = {
  BD: { lat: 23.7, lng: 90.35, zoom: 7 }, IN: { lat: 22.5, lng: 79, zoom: 5 }, PK: { lat: 30, lng: 70, zoom: 5 }, NP: { lat: 28.2, lng: 84, zoom: 7 },
  LK: { lat: 7.8, lng: 80.7, zoom: 7 }, BT: { lat: 27.5, lng: 90.4, zoom: 8 }, MM: { lat: 19.5, lng: 96, zoom: 6 }, ID: { lat: -2.5, lng: 118, zoom: 5 },
  MY: { lat: 4, lng: 102, zoom: 6 }, SG: { lat: 1.35, lng: 103.82, zoom: 11 }, PH: { lat: 12.5, lng: 122, zoom: 6 }, TH: { lat: 15, lng: 101, zoom: 6 },
  VN: { lat: 16, lng: 107, zoom: 6 }, CN: { lat: 35, lng: 104, zoom: 4 }, JP: { lat: 36.5, lng: 138, zoom: 5 }, KR: { lat: 36.3, lng: 127.9, zoom: 7 },
  AE: { lat: 24, lng: 54, zoom: 7 }, SA: { lat: 24, lng: 45, zoom: 5 }, QA: { lat: 25.3, lng: 51.2, zoom: 9 }, TR: { lat: 39, lng: 35, zoom: 6 },
  EG: { lat: 26.8, lng: 30.8, zoom: 6 }, NG: { lat: 9.1, lng: 8.7, zoom: 6 }, KE: { lat: 0.2, lng: 37.9, zoom: 6 }, ZA: { lat: -29, lng: 25, zoom: 5 },
  ET: { lat: 9.1, lng: 40.5, zoom: 6 }, GH: { lat: 7.9, lng: -1, zoom: 7 }, GB: { lat: 54, lng: -2.5, zoom: 6 }, IE: { lat: 53.4, lng: -8, zoom: 7 },
  DE: { lat: 51.2, lng: 10.4, zoom: 6 }, FR: { lat: 46.6, lng: 2.4, zoom: 6 }, ES: { lat: 40.2, lng: -3.7, zoom: 6 }, IT: { lat: 42.8, lng: 12.6, zoom: 6 },
  NL: { lat: 52.2, lng: 5.3, zoom: 7 }, SE: { lat: 62, lng: 15, zoom: 5 }, US: { lat: 39.8, lng: -98.6, zoom: 4 }, CA: { lat: 57, lng: -96, zoom: 3 },
  MX: { lat: 23.6, lng: -102.5, zoom: 5 }, BR: { lat: -14.2, lng: -51.9, zoom: 4 }, AR: { lat: -38.4, lng: -63.6, zoom: 4 }, AU: { lat: -25.3, lng: 133.8, zoom: 4 },
  NZ: { lat: -41.3, lng: 174.8, zoom: 5 },
}

/** City centres (approximate) keyed by country, with common alternative spellings. */
const CITIES: Record<string, [string[], number, number][]> = {
  BD: [
    [['dhaka', 'dacca'], 23.8103, 90.4125], [['chattogram', 'chittagong', 'agrabad'], 22.3569, 91.7832], [['sylhet'], 24.8949, 91.8687],
    [['rajshahi'], 24.3745, 88.6042], [['khulna'], 22.8456, 89.5403], [['barishal', 'barisal'], 22.701, 90.3535], [['rangpur'], 25.7439, 89.2752],
    [['mymensingh'], 24.7471, 90.4203], [['cumilla', 'comilla'], 23.4607, 91.1809], [['gazipur'], 23.9999, 90.4203],
    [['narayanganj'], 23.6238, 90.5], [["cox's bazar", 'coxs bazar', 'cox bazar'], 21.4272, 92.0058], [['savar'], 23.8583, 90.2667],
    [['bogura', 'bogra'], 24.8465, 89.3773], [['jashore', 'jessore'], 23.1664, 89.2081], [['noakhali'], 22.8696, 91.0995],
  ],
  IN: [[['delhi', 'new delhi'], 28.6139, 77.209], [['mumbai', 'bombay'], 19.076, 72.8777], [['kolkata', 'calcutta'], 22.5726, 88.3639], [['bengaluru', 'bangalore'], 12.9716, 77.5946], [['chennai'], 13.0827, 80.2707]],
  NP: [[['kathmandu'], 27.7172, 85.324]], PK: [[['karachi'], 24.8607, 67.0011], [['lahore'], 31.5204, 74.3587], [['islamabad'], 33.6844, 73.0479]],
  LK: [[['colombo'], 6.9271, 79.8612]], GB: [[['london'], 51.5074, -0.1278], [['manchester'], 53.4808, -2.2426]], US: [[['new york', 'new york city', 'nyc'], 40.7128, -74.006], [['san francisco'], 37.7749, -122.4194]],
  KE: [[['nairobi'], -1.2921, 36.8219]], NG: [[['lagos'], 6.5244, 3.3792]], ID: [[['jakarta'], -6.2088, 106.8456]], MY: [[['kuala lumpur'], 3.139, 101.6869]],
  SG: [[['singapore'], 1.3521, 103.8198]], AE: [[['dubai'], 25.2048, 55.2708], [['abu dhabi'], 24.4539, 54.3773]], DE: [[['berlin'], 52.52, 13.405]], FR: [[['paris'], 48.8566, 2.3522]],
  CA: [[['toronto'], 43.6532, -79.3832]], AU: [[['sydney'], -33.8688, 151.2093]], JP: [[['tokyo'], 35.6762, 139.6503]], PH: [[['manila'], 14.5995, 120.9842]],
  TH: [[['bangkok'], 13.7563, 100.5018]], EG: [[['cairo'], 30.0444, 31.2357]],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’']/g, "'")

export type Placement = { lat: number; lng: number; precision: 'city' | 'country' }

/** Where to put a marker for a listing. Returns null when neither the city nor the country is known. */
export function locate(city: string | null | undefined, country: string | null | undefined): Placement | null {
  const cc = (country ?? '').toUpperCase()
  if (city) {
    const c = norm(city)
    const lists = cc && CITIES[cc] ? [CITIES[cc]] : Object.values(CITIES)
    for (const list of lists) for (const [names, lat, lng] of list) if (names.includes(c)) return { lat, lng, precision: 'city' }
  }
  const v = COUNTRY_VIEW[cc]
  return v ? { lat: v.lat, lng: v.lng, precision: 'country' } : null
}

/** Rounds a coordinate to about 5 km (0.05°), the precision proposed for opt-in volunteer areas. */
export const roundToArea = (deg: number, step = 0.05) => Math.round(deg / step) * step

export const WORLD_VIEW: LatLngZoom = { lat: 20, lng: 20, zoom: 2 }
