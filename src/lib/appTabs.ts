import type { MyApplication } from './platform'

export type AppTab = 'all' | 'pending' | 'offers' | 'accepted' | 'not_selected' | 'withdrawn'
export const APP_TABS: { value: AppTab; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'offers', label: 'Offers' },
  { value: 'accepted', label: 'Accepted' }, { value: 'not_selected', label: 'Not selected' }, { value: 'withdrawn', label: 'Withdrawn' },
]
/** Which prototype tab an application belongs to (display grouping only; statuses come from the database). */
export function appTabOf(a: MyApplication): Exclude<AppTab, 'all'> {
  if (a.offer_status === 'accepted') return 'accepted'
  if (a.status === 'selected') return 'offers'
  if (a.status === 'rejected') return 'not_selected'
  if (a.status === 'withdrawn' || a.status === 'declined' || a.status === 'expired') return 'withdrawn'
  return 'pending'
}
