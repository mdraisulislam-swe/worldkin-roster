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
