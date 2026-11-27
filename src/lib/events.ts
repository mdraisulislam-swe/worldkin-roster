import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from './supabase'
import { toAppError } from './errors'
import { isUuid } from './ids'
import type { Enums } from './database.types'
import type { CompensationType, SelectionMode } from './platform'

/**
 * Public "events" are scheduled shifts of public opportunities. RLS (shifts_select →
 * is_opportunity_public) already hides drafts, closed or sensitive listings and
 * unverified organizations, so nothing here widens access.
 */
export type PublicEvent = {
  id: string; title: string | null; starts_at: string; ends_at: string; capacity: number; opportunity_id: string
  opportunities: {
    id: string; title: string; description: string; cause: Enums<'cause_category'>; mode: Enums<'opportunity_mode'>
    city: string | null; country_code: string | null; compensation_type: CompensationType; selection_mode: SelectionMode
    org_id: string
    /** Optional detail fields (public columns of the opportunity). */
    requirements?: string | null; skills_wanted?: string[]; compensation_details?: string | null
    organizations: { id: string; name: string; slug: string; status: Enums<'org_status'>; logo_url: string | null } | null
  } | null
}

const SELECT = 'id, title, starts_at, ends_at, capacity, opportunity_id, opportunities!inner(id, title, description, cause, mode, city, country_code, compensation_type, selection_mode, org_id, requirements, skills_wanted, compensation_details, organizations(id, name, slug, status, logo_url))'
const raw = () => db() as unknown as SupabaseClient

async function list(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<PublicEvent[]> {
  const { data, error } = await q
  if (error) throw toAppError(error)
  return ((data ?? []) as PublicEvent[]).filter((e) => e.opportunities)
}

/** Ongoing and upcoming events within `days` (default 60), soonest first. */
export function getUpcomingEvents(now: number, opts: { days?: number; orgId?: string; limit?: number } = {}) {
  let q = raw().from('shifts').select(SELECT).eq('status', 'scheduled')
    .gt('ends_at', new Date(now).toISOString())
    .lt('starts_at', new Date(now + (opts.days ?? 60) * 86_400_000).toISOString())
  if (opts.orgId) q = q.eq('org_id', opts.orgId)
  return list(q.order('starts_at', { ascending: true }).limit(opts.limit ?? 100))
}

/** Events that already took place (scheduled, not cancelled) within `days` (default 60), latest first. */
export function getRecentEvents(now: number, opts: { days?: number; orgId?: string; limit?: number } = {}) {
  let q = raw().from('shifts').select(SELECT).eq('status', 'scheduled')
    .lte('ends_at', new Date(now).toISOString())
    .gte('starts_at', new Date(now - (opts.days ?? 60) * 86_400_000).toISOString())
  if (opts.orgId) q = q.eq('org_id', opts.orgId)
  return list(q.order('starts_at', { ascending: false }).limit(opts.limit ?? 30))
}

export { isUuid } from './ids'

/** A malformed id is simply "not found" (never a raw database error). */
export async function getEvent(id: string) {
  if (!isUuid(id)) return null
  const rows = await list(raw().from('shifts').select(SELECT).eq('id', id).limit(1))
  return rows[0] ?? null
}

/** Splits events into ongoing (started, not ended) and upcoming. */
export function splitByTime(events: PublicEvent[], now: number) {
  const ongoing: PublicEvent[] = [], upcoming: PublicEvent[] = []
  for (const e of events) {
    if (new Date(e.starts_at).getTime() <= now && new Date(e.ends_at).getTime() > now) ongoing.push(e)
    else if (new Date(e.starts_at).getTime() > now) upcoming.push(e)
  }
  return { ongoing, upcoming }
}

export function eventTitle(e: PublicEvent) {
  return e.title?.trim() || e.opportunities?.title || 'Event'
}
