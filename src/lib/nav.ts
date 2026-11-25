/** Dashboard section links (data only; rendered by DashboardNav). */
export type NavItem = { to: string; label: string; end?: boolean; badge?: number }

export const VOLUNTEER_NAV: NavItem[] = [
  { to: '/me', label: 'Overview & shifts', end: true },
  { to: '/me/applications', label: 'Applications & offers' },
  { to: '/me/record', label: 'Hours & certificates' },
  { to: '/me/notifications', label: 'Notifications' },
  { to: '/me/complaints', label: 'Complaints' },
  { to: '/me/profile', label: 'Profile & settings' },
]

export function orgNav(orgId: string, isAdmin: boolean): NavItem[] {
  return [
    { to: `/org/${orgId}`, label: 'Overview', end: true },
    { to: `/org/${orgId}/applications`, label: 'Applicants & offers' },
    ...(isAdmin ? [
      { to: `/org/${orgId}/settings`, label: 'Profile & verification' },
      { to: `/org/${orgId}/team`, label: 'Team' },
      { to: `/org/${orgId}/audit`, label: 'Audit log' },
    ] : []),
  ]
}
