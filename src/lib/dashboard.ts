import type { MyApplication } from './platform'

/** Profile fields that make a volunteer profile useful to organizations (all real, editable columns). */
const PROFILE_FIELDS = [
  ['bio', 'About you'],
  ['skills', 'Skills'],
  ['languages', 'Languages'],
  ['city', 'City'],
  ['availability', 'Availability'],
  ['avatar_url', 'Profile photo'],
] as const

type ProfileLike = Partial<Record<(typeof PROFILE_FIELDS)[number][0], unknown>>

function filled(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return typeof v === 'string' ? v.trim().length > 0 : v != null
}

export function profileCompletion(p: ProfileLike | null | undefined) {
  const missing = PROFILE_FIELDS.filter(([k]) => !filled(p?.[k])).map(([, label]) => label)
  const total = PROFILE_FIELDS.length
  return { done: total - missing.length, total, pct: Math.round(((total - missing.length) / total) * 100), missing }
}

/** Groups the volunteer's applications by what they need to do next. Offers count only while still open. */
export function summarizeApplications(apps: MyApplication[], now: number) {
  const openOffer = (a: MyApplication) =>
    a.offer_status === 'pending' && (!a.offer_expires_at || new Date(a.offer_expires_at).getTime() > now)
  return {
    inProgress: apps.filter((a) => (a.status === 'submitted' || a.status === 'under_review') && !openOffer(a)).length,
    offers: apps.filter(openOffer).length,
    accepted: apps.filter((a) => a.offer_status === 'accepted').length,
    closed: apps.filter((a) => ['rejected', 'withdrawn', 'declined', 'expired'].includes(a.status)).length,
  }
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * Where "Dashboard" leads after sign-in. Staff of several organizations choose one
 * (no silent default); the organization is always taken from the URL, and every
 * page is still authorised by RLS/RPC checks, so this only affects navigation.
 */
export function dashboardPath(o: { isPlatformAdmin: boolean; orgIds: string[]; signupIntent?: unknown }): string {
  if (o.isPlatformAdmin) return '/admin'
  if (o.orgIds.length > 1) return '/orgs'
  if (o.orgIds.length === 1) return '/org/' + o.orgIds[0]
  if (o.signupIntent === 'organization') return '/orgs/new'
  return '/me'
}

/** Groups dated items by the viewer's local calendar day, in order, with friendly labels. */
export function groupByDay<T>(items: T[], dateOf: (t: T) => string, now: number) {
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const today = new Date(now)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const it of [...items].sort((a, b) => new Date(dateOf(a)).getTime() - new Date(dateOf(b)).getTime())) {
    const d = new Date(dateOf(it))
    const key = dayKey(d)
    let g = groups.find((x) => x.key === key)
    if (!g) {
      const label = key === dayKey(today) ? 'Today' : key === dayKey(tomorrow) ? 'Tomorrow' : fmt.format(d)
      g = { key, label, items: [] }
      groups.push(g)
    }
    g.items.push(it)
  }
  return groups
}

export type RecordRow = {
  id: string; hours: number | string; verified_at: string
  organizations: { name: string } | null
  shifts: { starts_at: string; ends_at?: string; opportunities: { title: string; cause?: string; compensation_type?: string } | null } | null
}

/**
 * One line per (organization, opportunity) from organization-verified participation
 * records only: first/last date, number of verified sessions and total verified hours.
 */
export function summarizeExperience(rows: RecordRow[]) {
  const map = new Map<string, { org: string; title: string; cause?: string; compensation?: string; first: string; last: string; sessions: number; hours: number }>()
  for (const r of rows) {
    const org = r.organizations?.name ?? 'Organization'
    const title = r.shifts?.opportunities?.title ?? 'Opportunity (no longer listed)'
    const when = r.shifts?.starts_at ?? r.verified_at
    const key = org + '\u0000' + title
    const e = map.get(key)
    if (!e) {
      map.set(key, { org, title, cause: r.shifts?.opportunities?.cause, compensation: r.shifts?.opportunities?.compensation_type, first: when, last: when, sessions: 1, hours: Number(r.hours) })
    } else {
      e.sessions += 1
      e.hours += Number(r.hours)
      if (when < e.first) e.first = when
      if (when > e.last) e.last = when
    }
  }
  return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1)).map((e) => ({ ...e, hours: Math.round(e.hours * 100) / 100 }))
}
