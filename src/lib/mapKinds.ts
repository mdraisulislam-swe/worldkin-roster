export type MapPointKind = 'opp' | 'event' | 'org'
export type MapPoint = {
  id: string; kind: MapPointKind; lat: number; lng: number; precision: 'city' | 'country'
  title: string; sub: string; area: string; href: string
}

/** Kind → label and colour (prototype: opportunity teal, event amber-brown, organization deep forest). */
export const KIND_STYLE: Record<MapPointKind, { label: string; color: string }> = {
  opp: { label: 'Opportunity', color: '#0f5e57' },
  event: { label: 'Event', color: '#a9531c' },
  org: { label: 'Organization', color: '#0c3b36' },
}
