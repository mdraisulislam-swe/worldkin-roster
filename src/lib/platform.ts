/**
 * Types, labels and data access for the applications platform (migration wk06).
 * database.types.ts is generated from the live schema and is regenerated once
 * wk06 is applied; until then these hand-written types describe the new
 * objects. Every call is still authorized by the database (RLS + RPC checks).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from './supabase'
import { AppError, toAppError } from './errors'
import type { Enums } from './database.types'

// ------------------------------------------------------------------ enums
export const COMPENSATION_TYPES = ['voluntary', 'stipend', 'paid'] as const
export type CompensationType = (typeof COMPENSATION_TYPES)[number]
export const COMPENSATION_LABELS: Record<CompensationType, string> = { voluntary: 'Voluntary', stipend: 'Stipend-based', paid: 'Paid' }

export const SELECTION_MODES = ['open', 'application'] as const
export type SelectionMode = (typeof SELECTION_MODES)[number]
export const SELECTION_LABELS: Record<SelectionMode, string> = {
  open: 'Open sign-up — volunteers join shifts directly',
  application: 'Application — you review applicants and send offers',
}

export const ORG_TYPES = ['ngo', 'charity', 'community_group', 'social_enterprise', 'government', 'international', 'academic', 'other'] as const
export type OrgType = (typeof ORG_TYPES)[number]
export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  ngo: 'NGO', charity: 'Charity', community_group: 'Community group', social_enterprise: 'Social enterprise',
  government: 'Government body', international: 'International organization', academic: 'Academic institution', other: 'Other',
}

export type ApplicationStatus = 'submitted' | 'under_review' | 'selected' | 'rejected' | 'withdrawn' | 'declined' | 'expired'
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked'
export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'dismissed'
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Submitted', under_review: 'Under review', selected: 'Selected', rejected: 'Not selected',
  withdrawn: 'Withdrawn', declined: 'Offer declined', expired: 'Offer expired',
}

// The new RPCs/tables are not in the generated types yet: use an untyped
// client for them and describe results explicitly below.
const raw = () => db() as unknown as SupabaseClient
async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await raw().rpc(fn, args)
  if (error) throw toAppError(error)
  return data as T
}
async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw toAppError(error)
  return (data ?? []) as T[]
}

// ------------------------------------------------------------------ public
export type PlatformStats = {
  volunteers: number; verified_organizations: number; active_opportunities: number
  completed_events: number; verified_hours: number; countries: number; cities: number
}
export const getPlatformStats = () => call<PlatformStats>('platform_stats')

export type OpportunityCard = {
  id: string; org_id: string; org_name: string; org_slug: string; title: string
  cause: Enums<'cause_category'>; mode: Enums<'opportunity_mode'>; country_code: string | null; city: string | null
  is_sensitive: boolean; published_at: string | null; compensation_type: CompensationType; compensation_details: string | null
  selection_mode: SelectionMode; application_deadline: string | null; skills_wanted: string[]
  next_shift_at: string | null; upcoming_shifts: number; open_spots: number; total_count: number
}
export type SearchSort = 'soonest' | 'newest' | 'most_open' | 'relevance' | 'closing'
export type OpportunitySearch = {
  query?: string; cause?: Enums<'cause_category'>; country?: string; city?: string; mode?: Enums<'opportunity_mode'>
  compensation?: CompensationType; skill?: string; startsAfter?: string; onlyOpen?: boolean; sort?: SearchSort; orgId?: string
  page?: number; pageSize?: number
}
export async function searchOpportunities(p: OpportunitySearch) {
  const pageSize = p.pageSize ?? 12
  const data = await call<OpportunityCard[]>('search_opportunities', {
    p_query: p.query || null, p_cause: p.cause ?? null, p_country_code: p.country || null, p_mode: p.mode ?? null,
    p_starts_after: p.startsAfter || null, p_only_open: p.onlyOpen ?? false, p_sort: p.sort ?? 'soonest',
    p_limit: pageSize, p_offset: ((p.page ?? 1) - 1) * pageSize,
    p_compensation: p.compensation ?? null, p_city: p.city || null, p_skill: p.skill || null, p_org_id: p.orgId ?? null,
  })
  const list = data ?? []
  return { rows: list, total: Number(list[0]?.total_count ?? 0), pageSize }
}

export type OrgCard = {
  id: string; name: string; slug: string; description: string | null; cause: Enums<'cause_category'>; org_type: OrgType
  country_code: string; city: string | null; website: string | null; logo_url: string | null
  published_opportunities: number; average_rating: number | null; review_count: number; total_count: number
}
export async function listOrganizations(p: { query?: string; country?: string; cause?: Enums<'cause_category'>; orgType?: OrgType; page?: number; pageSize?: number }) {
  const pageSize = p.pageSize ?? 12
  const data = await call<OrgCard[]>('list_organizations', {
    p_query: p.query || null, p_country_code: p.country || null, p_cause: p.cause ?? null, p_org_type: p.orgType ?? null,
    p_limit: pageSize, p_offset: ((p.page ?? 1) - 1) * pageSize,
  })
  const list = data ?? []
  return { rows: list, total: Number(list[0]?.total_count ?? 0), pageSize }
}

export type OrganizationFull = {
  id: string; name: string; slug: string; description: string | null; cause: Enums<'cause_category'>; country_code: string
  website: string | null; status: Enums<'org_status'>; status_reason: string | null; org_type: OrgType; city: string | null
  phone: string | null; official_email: string | null; logo_url: string | null; created_at: string
}
export async function getOrganizationBySlug(slug: string) {
  const list = await rows<OrganizationFull>(raw().from('organizations').select('*').eq('slug', slug).limit(1))
  if (!list[0]) throw new AppError('This organization is not available.', 'NOT_FOUND')
  return list[0]
}
export async function getOrganizationFull(orgId: string) {
  const list = await rows<OrganizationFull>(raw().from('organizations').select('*').eq('id', orgId).limit(1))
  if (!list[0]) throw new AppError('Organization not found.', 'NOT_FOUND')
  return list[0]
}
export type OrgFeedback = { feedback_id: string; rating: number; comment: string | null; created_at: string; reviewer_first_name: string; opportunity_title: string; average_rating: number; total_count: number }
export const getOrgFeedback = (orgId: string, limit = 20) => call<OrgFeedback[]>('org_feedback', { p_org_id: orgId, p_limit: limit, p_offset: 0 })

/** Extra opportunity fields added by wk06 (read with select('*')). */
export type OpportunityExtra = {
  compensation_type: CompensationType; compensation_details: string | null; selection_mode: SelectionMode
  application_deadline: string | null; moderation_reason: string | null
}

// ------------------------------------------------------------------ profiles
export type ProfileExtra = {
  education: string | null; interests: string[]; languages: string[]; availability: string | null
  experience: string | null; avatar_url: string | null; suspended_at: string | null; suspended_reason: string | null
}
export async function getMyPhone(userId: string) {
  const list = await rows<{ phone: string | null }>(raw().from('profile_private').select('phone').eq('id', userId).limit(1))
  return list[0]?.phone ?? null
}
export async function saveMyPhone(userId: string, phone: string | null) {
  const { error } = await raw().from('profile_private').upsert({ id: userId, phone }, { onConflict: 'id' })
  if (error) throw toAppError(error)
}
export async function updateProfileFull(userId: string, values: Record<string, unknown>) {
  const { error } = await raw().from('profiles').update(values).eq('id', userId)
  if (error) throw toAppError(error)
}

/** Uploads an image to the public avatars bucket under the caller's own folder. */
export async function uploadImage(ownerFolder: string, file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new AppError('Use a PNG, JPEG or WebP image.', 'INVALID_FILE')
  if (file.size > 2 * 1024 * 1024) throw new AppError('Images must be 2 MB or smaller.', 'INVALID_FILE')
  const ext = file.type.split('/')[1]
  const path = `${ownerFolder}/${Date.now()}.${ext}`
  const { error } = await raw().storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw toAppError(error)
  return raw().storage.from('avatars').getPublicUrl(path).data.publicUrl
}

// ------------------------------------------------------------------ organizations (staff)
export type OrgPrivate = {
  org_id: string; address: string | null; registration_id: string | null; representative_name: string | null
  representative_role: string | null; verification_docs: string[]
}
export async function getOrgPrivate(orgId: string) {
  const list = await rows<OrgPrivate>(raw().from('organization_private').select('*').eq('org_id', orgId).limit(1))
  return list[0] ?? null
}
export async function saveOrgPrivate(orgId: string, v: Omit<OrgPrivate, 'org_id'>) {
  const { error } = await raw().from('organization_private').upsert({ org_id: orgId, ...v }, { onConflict: 'org_id' })
  if (error) throw toAppError(error)
}
export async function updateOrganizationPublic(orgId: string, v: Record<string, unknown>) {
  const { error } = await raw().from('organizations').update(v).eq('id', orgId)
  if (error) throw toAppError(error)
}
export async function uploadVerificationDoc(orgId: string, file: File): Promise<string> {
  if (!/^(application\/pdf|image\/(png|jpeg))$/.test(file.type)) throw new AppError('Upload a PDF, PNG or JPEG file.', 'INVALID_FILE')
  if (file.size > 5 * 1024 * 1024) throw new AppError('Documents must be 5 MB or smaller.', 'INVALID_FILE')
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)
  const path = `${orgId}/${Date.now()}-${safe}`
  const { error } = await raw().storage.from('org-docs').upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw toAppError(error)
  return path
}
export async function signedDocUrl(path: string) {
  const { data, error } = await raw().storage.from('org-docs').createSignedUrl(path, 300)
  if (error) throw toAppError(error)
  return data.signedUrl
}
export type CreateOrgInput = {
  name: string; slug: string; cause: Enums<'cause_category'>; country_code: string; description: string | null; website: string | null
  org_type: OrgType; city: string | null; phone: string | null; official_email: string | null
  address: string | null; registration_id: string | null; representative_name: string | null; representative_role: string | null
}
export const createOrganizationFull = (v: CreateOrgInput) => call<string>('create_organization', {
  p_name: v.name, p_slug: v.slug, p_cause: v.cause, p_country_code: v.country_code, p_description: v.description, p_website: v.website,
  p_org_type: v.org_type, p_city: v.city, p_phone: v.phone, p_official_email: v.official_email, p_address: v.address,
  p_registration_id: v.registration_id, p_representative_name: v.representative_name, p_representative_role: v.representative_role,
})

// ------------------------------------------------------------------ applications & offers
export type MyApplication = {
  application_id: string; opportunity_id: string; opportunity_title: string; org_id: string; org_name: string
  status: ApplicationStatus; message: string | null; decision_reason: string | null; created_at: string; updated_at: string
  offer_id: string | null; offer_status: OfferStatus | null; offer_expires_at: string | null; offer_message: string | null
  shift_id: string | null; shift_title: string | null; shift_starts_at: string | null; shift_ends_at: string | null
  signup_id: string | null; signup_status: Enums<'signup_status'> | null
}
export const getMyApplications = () => call<MyApplication[]>('my_applications')
export const applyToOpportunity = (opportunityId: string, message: string | null) =>
  call<{ application_id: string; status: ApplicationStatus; replayed: boolean }>('apply_to_opportunity', { p_opportunity_id: opportunityId, p_message: message })
export const withdrawApplication = (id: string) => call<null>('withdraw_application', { p_application_id: id })

// Same idempotency key for retries of one acceptance (network-safe).
const acceptKeys = new Map<string, string>()
export function acceptOffer(offerId: string) {
  let key = acceptKeys.get(offerId)
  if (!key) { key = crypto.randomUUID(); acceptKeys.set(offerId, key) }
  return call<{ status: Enums<'signup_status'>; waitlist_position: number | null; replayed: boolean }>('accept_offer', { p_offer_id: offerId, p_idempotency_key: key })
}
export const declineOffer = (offerId: string) => call<null>('decline_offer', { p_offer_id: offerId })

export type OrgApplication = {
  application_id: string; opportunity_id: string; opportunity_title: string; volunteer_id: string
  applicant_name: string; applicant_country: string | null; applicant_city: string | null; applicant_bio: string | null
  applicant_skills: string[]; applicant_interests: string[]; applicant_languages: string[]
  applicant_education: string | null; applicant_experience: string | null; applicant_availability: string | null; applicant_verified_hours: number
  status: ApplicationStatus; message: string | null; decision_reason: string | null; note: string | null; created_at: string
  offer_id: string | null; offer_status: OfferStatus | null; offer_expires_at: string | null
  shift_id: string | null; shift_starts_at: string | null; signup_status: Enums<'signup_status'> | null; total_count: number
}
export const getOrgApplications = (orgId: string, opportunityId?: string, status?: ApplicationStatus) =>
  call<OrgApplication[]>('org_applications', { p_org_id: orgId, p_opportunity_id: opportunityId ?? null, p_status: status ?? null, p_limit: 100, p_offset: 0 })
export const reviewApplication = (id: string, action: 'under_review' | 'reject' | 'note', reason?: string | null, note?: string | null) =>
  call<null>('review_application', { p_application_id: id, p_action: action, p_reason: reason ?? null, p_note: note ?? null })
export const sendOffer = (applicationId: string, shiftId: string, message?: string | null) =>
  call<{ offer_id: string; expires_at: string }>('send_offer', { p_application_id: applicationId, p_shift_id: shiftId, p_message: message ?? null })
export const revokeOffer = (offerId: string, reason?: string | null) => call<null>('revoke_offer', { p_offer_id: offerId, p_reason: reason ?? null })
export async function getMyApplicationFor(userId: string, opportunityId: string) {
  const list = await rows<{ id: string; status: ApplicationStatus }>(
    raw().from('applications').select('id, status').eq('volunteer_id', userId).eq('opportunity_id', opportunityId).order('created_at', { ascending: false }).limit(1))
  return list[0] ?? null
}

// ------------------------------------------------------------------ participation & feedback
export type Participation = {
  participation_id: string; shift_id: string; shift_title: string | null; starts_at: string; ends_at: string
  opportunity_id: string; opportunity_title: string; cause: Enums<'cause_category'>; org_id: string; org_name: string
  hours: number; verified_at: string; feedback_id: string | null; feedback_rating: number | null
}
export const getMyParticipation = () => call<Participation[]>('my_participation')
export const submitFeedback = (participationId: string, rating: number, comment: string | null) =>
  call<string>('submit_feedback', { p_participation_id: participationId, p_rating: rating, p_comment: comment })

// ------------------------------------------------------------------ complaints
export type Complaint = {
  id: string; reporter_id: string; org_id: string | null; opportunity_id: string | null; subject: string; description: string
  status: ComplaintStatus; admin_response: string | null; handled_at: string | null; created_at: string
  reporter?: { full_name: string } | null; organizations?: { name: string } | null; opportunities?: { title: string } | null
}
export const submitComplaint = (subject: string, description: string, orgId?: string | null, opportunityId?: string | null) =>
  call<string>('submit_complaint', { p_subject: subject, p_description: description, p_org_id: orgId ?? null, p_opportunity_id: opportunityId ?? null })
export const getMyComplaints = (userId: string) =>
  rows<Complaint>(raw().from('complaints').select('*, organizations(name), opportunities(title)').eq('reporter_id', userId).order('created_at', { ascending: false }).limit(50))
export const getAllComplaints = (status?: ComplaintStatus) => {
  let q = raw().from('complaints').select('*, reporter:profiles!complaints_reporter_id_fkey(full_name), organizations(name), opportunities(title)').order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  return rows<Complaint>(q)
}
export const respondComplaint = (id: string, status: ComplaintStatus, response: string | null) =>
  call<null>('respond_complaint', { p_complaint_id: id, p_status: status, p_response: response })

// ------------------------------------------------------------------ notifications
export type Notification = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export const getNotifications = (userId: string, limit = 50) =>
  rows<Notification>(raw().from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit))
export async function getUnreadCount(userId: string) {
  const { count, error } = await raw().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
  if (error) throw toAppError(error)
  return count ?? 0
}
export async function markNotificationsRead(userId: string, ids?: string[]) {
  let q = raw().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null)
  if (ids) q = q.in('id', ids)
  const { error } = await q
  if (error) throw toAppError(error)
}

// ------------------------------------------------------------------ platform admin
export type AdminOverview = Record<
  'users' | 'suspended_users' | 'organizations_pending' | 'organizations_verified' | 'opportunities_published' | 'applications_active'
  | 'offers_pending' | 'signups_confirmed' | 'complaints_open' | 'feedback_published' | 'verified_hours', number>
export const getAdminOverview = () => call<AdminOverview>('admin_overview')
export type AdminUser = {
  user_id: string; full_name: string; email: string; country_code: string | null; city: string | null; platform_role: Enums<'platform_role'>
  suspended_at: string | null; suspended_reason: string | null; created_at: string; org_count: number; signup_count: number; application_count: number; total_count: number
}
export const getAdminUsers = (query: string, page = 1) => call<AdminUser[]>('admin_users', { p_query: query || null, p_limit: 25, p_offset: (page - 1) * 25 })
export const setSuspension = (userId: string, suspend: boolean, reason: string | null) =>
  call<null>('admin_set_suspension', { p_user_id: userId, p_suspend: suspend, p_reason: reason })
export const moderateOpportunity = (id: string, reason: string) => call<null>('admin_moderate_opportunity', { p_opportunity_id: id, p_reason: reason })
export type AdminFeedback = { id: string; rating: number; comment: string | null; status: 'published' | 'hidden'; created_at: string; organizations: { name: string } | null; opportunities: { title: string } | null; profiles: { full_name: string } | null }
export const getAllFeedback = () =>
  rows<AdminFeedback>(raw().from('feedback').select('id, rating, comment, status, created_at, organizations(name), opportunities(title), profiles!feedback_volunteer_id_fkey(full_name)').order('created_at', { ascending: false }).limit(100))
export const moderateFeedback = (id: string, status: 'published' | 'hidden', reason: string | null) =>
  call<null>('moderate_feedback', { p_feedback_id: id, p_status: status, p_reason: reason })
export type AdminOpportunity = { id: string; title: string; status: Enums<'opportunity_status'>; published_at: string | null; compensation_type: CompensationType; moderation_reason: string | null; organizations: { name: string; slug: string } | null }
export const getOpportunitiesForModeration = (status: Enums<'opportunity_status'> = 'published') =>
  rows<AdminOpportunity>(raw().from('opportunities').select('id, title, status, published_at, compensation_type, moderation_reason, organizations(name, slug)').eq('status', status).order('published_at', { ascending: false }).limit(100))
