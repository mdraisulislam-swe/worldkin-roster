import type { MapPoint } from './mapKinds'
import { countryName, locate } from './geo'
import type { PublicEvent } from './events'
import type { OpportunityCard, OrgCard } from './platform'

const areaLabel = (city: string | null | undefined, cc: string | null | undefined) =>
  [city, cc ? countryName(cc) : null].filter(Boolean).join(', ') || 'Location not given'

type Built = { points: MapPoint[]; unplaced: number }

/**
 * Turns public listings into map points. Only public, RLS-filtered data is used (published opportunities,
 * scheduled events of public opportunities, verified organizations). Remote opportunities are not
 * placed. Listings without a known city or country are counted in `unplaced` and stay in the list only.
 */
export function buildMapPoints(opps: OpportunityCard[], events: PublicEvent[], orgs: OrgCard[]): Built {
  const points: MapPoint[] = []
  let unplaced = 0
  for (const o of opps) {
    if (o.mode === 'remote') continue
    const at = locate(o.city, o.country_code)
    if (!at) { unplaced++; continue }
    points.push({ id: `opp:${o.id}`, kind: 'opp', ...at, title: o.title, sub: o.org_name, area: areaLabel(o.city, o.country_code), href: `/opportunities/${o.id}` })
  }
  for (const e of events) {
    const o = e.opportunities
    if (!o || o.mode === 'remote') continue
    const at = locate(o.city, o.country_code)
    if (!at) { unplaced++; continue }
    points.push({ id: `event:${e.id}`, kind: 'event', ...at, title: e.title || o.title, sub: o.organizations?.name ?? '', area: areaLabel(o.city, o.country_code), href: `/events/${e.id}` })
  }
  for (const g of orgs) {
    const at = locate(g.city, g.country_code)
    if (!at) { unplaced++; continue }
    points.push({ id: `org:${g.id}`, kind: 'org', ...at, title: g.name, sub: `${g.published_opportunities} open opportunit${g.published_opportunities === 1 ? 'y' : 'ies'}`, area: areaLabel(g.city, g.country_code), href: `/organizations/${g.slug}` })
  }
  return { points, unplaced }
}
