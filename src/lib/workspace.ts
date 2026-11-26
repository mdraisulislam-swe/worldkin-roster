/**
 * Which page chrome a path gets (pure, unit-tested).
 *
 * Workspace pages (volunteer /me, organization /org/:id, platform /admin) use
 * the full-height app shell without the public header and footer — but only
 * when the signed-in user may actually be there. Everyone else (signed out,
 * not a member, not an admin) keeps the public chrome around the guard's
 * redirect or "No access" message, so admin navigation is never shown to
 * ordinary users and a denied page still has a way back. UX only: every page
 * is authorized again by the database.
 */
import { isUuid } from './ids'

export type Chrome = 'public' | 'pending' | 'volunteer' | 'org' | 'admin'

export type ChromeInput = {
  pathname: string
  loading: boolean
  signedIn: boolean
  isPlatformAdmin: boolean
  memberOrgIds: string[]
}

/** Pages under /me that also serve organization staff show the volunteer workspace only to people without an organization (existing rule). */
export const VOLUNTEER_SHARED_PATHS = ['/me/profile', '/me/complaints']

export function workspaceChrome({ pathname, loading, signedIn, isPlatformAdmin, memberOrgIds }: ChromeInput): Chrome {
  const path = pathname.replace(/\/+$/, '') || '/'
  const isAdmin = path === '/admin' || path.startsWith('/admin/')
  const orgMatch = path.match(/^\/org\/([^/]+)/)
  const isMe = (path === '/me' || path.startsWith('/me/')) && !path.startsWith('/me/certificate')
  if (!isAdmin && !orgMatch && !isMe) return 'public'
  if (loading) return 'pending'
  if (!signedIn) return 'public'
  if (isAdmin) return isPlatformAdmin ? 'admin' : 'public'
  if (orgMatch) return isUuid(orgMatch[1]) && (memberOrgIds.includes(orgMatch[1]) || isPlatformAdmin) ? 'org' : 'public'
  if (VOLUNTEER_SHARED_PATHS.includes(path) && memberOrgIds.length > 0) return 'public'
  return 'volunteer'
}
