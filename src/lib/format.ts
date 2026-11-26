import type { Enums } from './database.types'

export const CAUSE_LABELS: Record<Enums<'cause_category'>, string> = {
  humanitarian: 'Humanitarian',
  disaster_response: 'Disaster response',
  refugee_support: 'Refugee support',
  conflict_relief: 'Conflict relief',
  food_security: 'Food security',
  health: 'Health',
  education: 'Education',
  environment: 'Environment',
  climate: 'Climate',
  community_development: 'Community development',
  social_welfare: 'Social welfare',
  other: 'Other',
}

export const MODE_LABELS: Record<Enums<'opportunity_mode'>, string> = {
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
}

export const SIGNUP_STATUS_LABELS: Record<Enums<'signup_status'>, string> = {
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  attended: 'Attended',
  no_show: 'No-show',
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export function formatShiftWindow(startsAt: string, endsAt: string): string {
  return `${dateTime.format(new Date(startsAt))} – ${time.format(new Date(endsAt))}`
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—'
}

export function shiftHours(startsAt: string, endsAt: string): number {
  return Math.round(((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000) * 100) / 100
}

/** "Today" / "Tomorrow" / "In 5 days" relative to now (calendar days, local time). */
export function startsIn(iso: string, now: number): string {
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const days = Math.round((day(new Date(iso).getTime()) - day(now)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

/** Urgency label for a listing, or null when nothing notable. */
export function spotsLabel(openSpots: number, upcomingShifts: number): { text: string; tone: 'warn' | 'muted' } | null {
  if (upcomingShifts === 0) return null
  if (openSpots === 0) return { text: 'Full — waitlist may be open', tone: 'muted' }
  if (openSpots <= 3) return { text: `Only ${openSpots} spot${openSpots === 1 ? '' : 's'} left`, tone: 'warn' }
  return null
}

/** Factual seat summary from search_opportunities: open seats (capacity − confirmed) across upcoming shifts. */
export function seatsSummary(openSpots: number, upcomingShifts: number): string | null {
  if (upcomingShifts <= 0) return null
  const shifts = `${upcomingShifts} upcoming shift${upcomingShifts === 1 ? '' : 's'}`
  return openSpots > 0 ? `${openSpots} open seat${openSpots === 1 ? '' : 's'} · ${shifts}` : `No open seats · ${shifts}`
}

/** "Org name" -> "org-name" (matches the database slug rule). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Datetime-local input value (local time) <-> ISO string. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** Case-insensitive skill overlap between a volunteer profile and an opportunity. */
export function matchingSkills(have: string[], want: string[]): string[] {
  const mine = new Set(have.map((s) => s.trim().toLowerCase()))
  return want.filter((w) => mine.has(w.trim().toLowerCase()))
}
