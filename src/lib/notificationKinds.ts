import type { IconName } from '../components/Icon'

/**
 * Prototype C07 row icon ("pin") per notification kind. Kinds are the values the
 * database functions insert (wk04/wk06). Display only; unknown kinds get a neutral bell.
 */
export type PinTone = 'green' | 'sky' | 'amber' | 'rose' | 'brand' | 'grey'
const KIND: Record<string, [IconName, PinTone]> = {
  offer_new: ['briefcase', 'sky'],
  offer_accepted: ['check-circle', 'green'],
  offer_declined: ['x-circle', 'grey'],
  offer_revoked: ['x-circle', 'rose'],
  application_new: ['inbox', 'brand'],
  application_review: ['clock', 'amber'],
  application_rejected: ['x-circle', 'rose'],
  application_withdrawn: ['x', 'grey'],
  waitlist_promoted: ['check-circle', 'green'],
  signup_cancelled: ['calendar', 'grey'],
  hours_verified: ['award', 'green'],
  feedback_new: ['heart', 'brand'],
  complaint_update: ['flag', 'amber'],
  org_status: ['shield-check', 'brand'],
  opportunity_moderated: ['alert', 'rose'],
  account_status: ['alert', 'rose'],
}
export function notificationPin(kind: string): [IconName, PinTone] {
  return KIND[kind] ?? ['bell', 'grey']
}
export const PIN_CLASS: Record<PinTone, string> = {
  green: 'bg-emerald-50 text-emerald-800', sky: 'bg-sky-50 text-sky-800', amber: 'bg-amber-50 text-amber-800',
  rose: 'bg-rose-50 text-rose-700', brand: 'bg-brand-50 text-brand-700', grey: 'bg-neutral-100 text-ink-700',
}
