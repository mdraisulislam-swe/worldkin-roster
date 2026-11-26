/**
 * Typed data-access layer. Every write goes either through a column-granted
 * table write (protected by RLS) or a SECURITY DEFINER RPC that re-checks
 * identity and role in the database. Nothing here is trusted for security.
 */
import { db } from './supabase'
import { AppError, toAppError, unwrap } from './errors'
import { joinKeys } from './idempotency'
import type { Enums, Json, Tables } from './database.types'

// ------------------------------------------------------------------ results
export type SignupResult = { signup_id: string; shift_id: string; status: Enums<'signup_status'>; replayed: boolean; waitlist_position: number | null }
export type Impact = {
  verified_hours: number; shifts_attended: number; upcoming_confirmed: number; waitlisted: number
  organizations_helped: number; hours_by_cause: { cause: Enums<'cause_category'>; hours: number }[]
}
export type OrgDashboard = {
  opportunities: { draft: number; published: number; closed: number }
  upcoming_shifts: number; upcoming_capacity: number; upcoming_confirmed: number; upcoming_waitlisted: number
  fill_rate_pct: number; verified_hours: number; unique_volunteers: number; attended: number; no_show: number; no_show_rate_pct: number
}
const as = <T>(v: Json): T => v as unknown as T

// ------------------------------------------------------------------ discovery
export type SearchParams = {
  query?: string; cause?: Enums<'cause_category'>; country?: string; mode?: Enums<'opportunity_mode'>
  onlyOpen?: boolean; sort?: 'soonest' | 'newest' | 'most_open' | 'relevance'; page?: number; pageSize?: number
}
export async function searchOpportunities(p: SearchParams) {
  const pageSize = p.pageSize ?? 12
  const rows = (unwrap(
    await db().rpc('search_opportunities', {
      p_query: p.query || undefined,
      p_cause: p.cause,
      p_country_code: p.country || undefined,
      p_mode: p.mode,
      p_only_open: p.onlyOpen ?? false,
      p_sort: p.sort ?? 'soonest',
      p_limit: pageSize,
      p_offset: ((p.page ?? 1) - 1) * pageSize,
    }),
  ) ?? [])
  return { rows, total: rows[0]?.total_count ?? 0, pageSize }
}

export async function getOpportunity(id: string) {
  const row = unwrap(
    await db().from('opportunities').select('*, organizations(id, name, slug, status, website)').eq('id', id).maybeSingle(),
  )
  if (!row) throw new AppError('This opportunity is not available.', 'NOT_FOUND')
  return row
}

export async function getShiftAvailability(opportunityId: string) {
  return unwrap(await db().rpc('shift_availability', { p_opportunity_id: opportunityId }))
}

// ------------------------------------------------------------------ volunteer
export async function joinShift(shiftId: string): Promise<SignupResult> {
  const key = joinKeys.keyFor(shiftId)
  const res = await db().rpc('join_shift', { p_shift_id: shiftId, p_idempotency_key: key })
  if (res.error) {
    const err = toAppError(res.error)
    if (!err.retryable) joinKeys.release(shiftId) // definitive business answer
    throw err
  }
  joinKeys.release(shiftId)
  return as<SignupResult>(res.data)
}

export async function cancelSignup(signupId: string, reason?: string) {
  return as<{ status: string; promoted_signup_ids: string[]; replayed: boolean }>(
    unwrap(await db().rpc('cancel_signup', { p_signup_id: signupId, p_reason: reason })),
  )
}

export async function getMySignups(userId: string) {
  return unwrap(
    await db()
      .from('signups')
      .select('id, status, created_at, promoted_at, shift_id, shifts(title, starts_at, ends_at, status, opportunity_id, opportunities(id, title, organizations(name)))')
      .eq('volunteer_id', userId)
      .order('created_at', { ascending: false }),
  )
}

/** Own verified participation (RLS: volunteer_id = auth.uid()). Embedded rows may be null if no longer visible. */
export async function getMyRecord(userId: string) {
  return unwrap(
    await db()
      .from('participation_records')
      .select('id, hours, verified_at, note, organizations(name), shifts(starts_at, ends_at, opportunities(title, cause, compensation_type))')
      .eq('volunteer_id', userId)
      .order('verified_at', { ascending: false }),
  )
}

export async function getMyImpact(): Promise<Impact> {
  return as<Impact>(unwrap(await db().rpc('my_impact')))
}

export async function getMyInvites() {
  return unwrap(await db().rpc('my_org_invites'))
}

export async function acceptInvite(inviteId: string) {
  return unwrap(await db().rpc('accept_org_invite', { p_invite_id: inviteId }))
}

export async function updateProfile(userId: string, values: Pick<Tables<'profiles'>, 'full_name' | 'country_code' | 'city' | 'bio' | 'skills'>) {
  return unwrap(await db().from('profiles').update(values).eq('id', userId).select().single())
}

// ------------------------------------------------------------------ organizations
export async function createOrganization(v: {
  name: string; slug: string; cause: Enums<'cause_category'>; country_code: string; description: string | null; website: string | null
}) {
  return unwrap(
    await db().rpc('create_organization', {
      p_name: v.name, p_slug: v.slug, p_cause: v.cause, p_country_code: v.country_code,
      p_description: v.description ?? undefined, p_website: v.website ?? undefined,
    }),
  )
}

export async function getOrganization(orgId: string) {
  const row = unwrap(await db().from('organizations').select('*').eq('id', orgId).maybeSingle())
  if (!row) throw new AppError('Organization not found or not accessible.', 'NOT_FOUND')
  return row
}

export async function getOrgDashboard(orgId: string): Promise<OrgDashboard> {
  return as<OrgDashboard>(unwrap(await db().rpc('org_dashboard', { p_org_id: orgId })))
}

export async function getOrgOpportunities(orgId: string) {
  return unwrap(
    await db()
      .from('opportunities')
      .select('id, title, status, cause, mode, city, is_sensitive, published_at, shifts(id, starts_at, status)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
  )
}

export type OpportunityInput = Pick<
  Tables<'opportunities'>,
  'title' | 'description' | 'cause' | 'mode' | 'country_code' | 'city' | 'skills_wanted' | 'requirements' | 'requires_skill_match' | 'is_sensitive'
>
/** wk06 columns (compensation, selection mode, deadline) — not in the generated types until regeneration. */
export type OpportunityExtraInput = {
  compensation_type: 'voluntary' | 'stipend' | 'paid'; compensation_details: string | null
  selection_mode: 'open' | 'application'; application_deadline: string | null
}
export async function createOpportunity(orgId: string, v: OpportunityInput & Partial<OpportunityExtraInput>, publish: boolean) {
  const row = { ...v, org_id: orgId, status: publish ? 'published' : 'draft' }
  return unwrap(await db().from('opportunities').insert(row as never).select('id').single())
}
export async function updateOpportunity(id: string, v: Partial<OpportunityInput & OpportunityExtraInput> & { status?: Enums<'opportunity_status'> }) {
  return unwrap(await db().from('opportunities').update(v as never).eq('id', id).select('id').single())
}

export async function getOpportunityShifts(opportunityId: string) {
  return unwrap(
    await db().from('shifts').select('*').eq('opportunity_id', opportunityId).order('starts_at', { ascending: true }),
  )
}

export async function createShift(v: {
  opportunity_id: string; org_id: string; title: string | null; starts_at: string; ends_at: string; capacity: number; waitlist_limit: number
}) {
  return unwrap(await db().from('shifts').insert(v).select('id').single())
}

export async function getShift(shiftId: string) {
  const row = unwrap(await db().from('shifts').select('*, opportunities(id, title)').eq('id', shiftId).maybeSingle())
  if (!row) throw new AppError('Shift not found or not accessible.', 'NOT_FOUND')
  return row
}

export async function getRoster(shiftId: string) {
  return unwrap(await db().rpc('get_shift_roster', { p_shift_id: shiftId }))
}
export async function updateCapacity(shiftId: string, capacity: number) {
  return as<{ capacity: number; confirmed: number; promoted_signup_ids: string[] }>(
    unwrap(await db().rpc('update_shift_capacity', { p_shift_id: shiftId, p_capacity: capacity })),
  )
}
export async function cancelShift(shiftId: string, reason: string) {
  return unwrap(await db().rpc('cancel_shift', { p_shift_id: shiftId, p_reason: reason }))
}
export async function recordAttendance(signupId: string, attended: boolean, hours?: number, note?: string) {
  return unwrap(
    await db().rpc('record_attendance', { p_signup_id: signupId, p_attended: attended, p_hours: hours, p_note: note || undefined }),
  )
}

export async function getMembers(orgId: string) {
  return unwrap(
    await db()
      .from('org_members')
      .select('user_id, role, created_at, profiles!org_members_user_id_fkey(full_name)')
      .eq('org_id', orgId)
      .order('created_at'),
  )
}
export async function getInvites(orgId: string) {
  return unwrap(
    await db()
      .from('org_invites')
      .select('id, email, role, created_at, expires_at, accepted_at, revoked_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
  )
}
export async function inviteMember(orgId: string, email: string, role: Enums<'org_role'>) {
  return unwrap(await db().rpc('invite_org_member', { p_org_id: orgId, p_email: email, p_role: role }))
}
export async function revokeInvite(inviteId: string) {
  return unwrap(await db().rpc('revoke_org_invite', { p_invite_id: inviteId }))
}
export async function removeMember(orgId: string, userId: string) {
  return unwrap(await db().rpc('remove_org_member', { p_org_id: orgId, p_user_id: userId }))
}

export async function getAuditLog(orgId?: string, limit = 100) {
  let q = db().from('audit_logs').select('*').order('occurred_at', { ascending: false }).limit(limit)
  if (orgId) q = q.eq('org_id', orgId)
  return unwrap(await q)
}

// ------------------------------------------------------------------ platform admin
export async function getOrganizationsForReview(status?: Enums<'org_status'>) {
  let q = db().from('organizations').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  return unwrap(await q)
}
export async function reviewOrganization(orgId: string, decision: Enums<'org_status'>, reason?: string) {
  return unwrap(await db().rpc('review_organization', { p_org_id: orgId, p_decision: decision, p_reason: reason || undefined }))
}
