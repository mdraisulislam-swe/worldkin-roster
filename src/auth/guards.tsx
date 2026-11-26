import type { ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { useAuth } from './AuthProvider'
import { LoadingState, ErrorState } from '../components/ui'

/** Signed-in users only. Redirects to sign-in and returns afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="Checking your session" />
  // Keep the query string (e.g. a listing being reported); safeNext() still allows same-site paths only.
  if (!session) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

/** Members of the :orgId organization (optionally admins only). UX gate; RLS is the real gate. */
export function RequireOrgRole({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { orgId = '' } = useParams()
  const { loading, roleIn, isPlatformAdmin } = useAuth()
  if (loading) return <LoadingState label="Checking access" />
  const role = roleIn(orgId)
  const allowed = adminOnly ? role === 'org_admin' : role !== null
  if (!allowed && !isPlatformAdmin) {
    return (
      <ErrorState
        title="No access"
        message={role && adminOnly ? 'Only organization admins can open this page.' : 'You are not a member of this organization.'}
      />
    )
  }
  return <>{children}</>
}

export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { loading, isPlatformAdmin } = useAuth()
  if (loading) return <LoadingState label="Checking access" />
  if (!isPlatformAdmin) return <ErrorState title="No access" message="Platform administrators only." />
  return <>{children}</>
}
