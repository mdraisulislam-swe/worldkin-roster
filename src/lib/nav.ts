import type { IconName } from '../components/Icon'

/** Dashboard section links (data only; rendered by DashboardNav and WorkspaceLayout). */
export type NavItem = { to: string; label: string; end?: boolean; badge?: number; icon?: IconName }

export const VOLUNTEER_NAV: NavItem[] = [
  { to: '/me', label: 'Overview & shifts', end: true, icon: 'home' },
  { to: '/me/applications', label: 'Applications & offers', icon: 'briefcase' },
  { to: '/me/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/me/record', label: 'Hours & certificates', icon: 'award' },
  { to: '/me/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/me/complaints', label: 'Complaints', icon: 'flag' },
  { to: '/me/profile', label: 'Profile & settings', icon: 'user' },
]

export function orgNav(orgId: string, isAdmin: boolean): NavItem[] {
  return [
    { to: `/org/${orgId}`, label: 'Overview', end: true, icon: 'home' },
    { to: `/org/${orgId}/applications`, label: 'Applicants & offers', icon: 'inbox' },
    ...(isAdmin ? [
      { to: `/org/${orgId}/settings`, label: 'Profile & verification', icon: 'shield-check' as const },
      { to: `/org/${orgId}/team`, label: 'Team', icon: 'users' as const },
      { to: `/org/${orgId}/audit`, label: 'Audit log', icon: 'list' as const },
    ] : []),
  ]
}

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', end: true, icon: 'home' },
  { to: '/admin/organizations', label: 'Organization verification', icon: 'shield-check' },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/opportunities', label: 'Opportunity moderation', icon: 'briefcase' },
  { to: '/admin/complaints', label: 'Complaints', icon: 'flag' },
  { to: '/admin/feedback', label: 'Feedback', icon: 'heart' },
  { to: '/admin/audit', label: 'Audit log', icon: 'list' },
]
