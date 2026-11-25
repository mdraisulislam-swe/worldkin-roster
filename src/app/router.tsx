import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { RequireAuth, RequireOrgRole, RequirePlatformAdmin } from '../auth/guards'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'

// Route-level code splitting: each area loads only when visited.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const SignInPage = page(() => import('../pages/AuthPages'), 'SignInPage')
const SignUpPage = page(() => import('../pages/AuthPages'), 'SignUpPage')
const ExplorePage = page(() => import('../pages/ExplorePage'), 'ExplorePage')
const OpportunityPage = page(() => import('../pages/OpportunityPage'), 'OpportunityPage')
const MyShiftsPage = page(() => import('../pages/MyShiftsPage'), 'MyShiftsPage')
const RecordPage = page(() => import('../pages/RecordPage'), 'RecordPage')
const ProfilePage = page(() => import('../pages/ProfilePage'), 'ProfilePage')
const MyOrgsPage = page(() => import('../pages/OrgListPages'), 'MyOrgsPage')
const OrgCreatePage = page(() => import('../pages/OrgListPages'), 'OrgCreatePage')
const OrgPage = page(() => import('../pages/OrgPage'), 'OrgPage')
const OpportunityEditorPage = page(() => import('../pages/OpportunityEditorPage'), 'OpportunityEditorPage')
const ShiftManagePage = page(() => import('../pages/ShiftManagePage'), 'ShiftManagePage')
const OrgTeamPage = page(() => import('../pages/OrgTeamPage'), 'OrgTeamPage')
const AuditPage = page(() => import('../pages/AuditPage'), 'AuditPage')
const AdminPage = page(() => import('../pages/AdminPage'), 'AdminPage')

/**
 * Route table. Guards are UX only — every query and RPC is authorized again
 * by the database (RLS, column grants, SECURITY DEFINER checks).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'opportunities/:id', element: <OpportunityPage /> },
      { path: 'signin', element: <SignInPage /> },
      { path: 'signup', element: <SignUpPage /> },

      { path: 'me', element: <RequireAuth><MyShiftsPage /></RequireAuth> },
      { path: 'me/record', element: <RequireAuth><RecordPage /></RequireAuth> },
      { path: 'me/profile', element: <RequireAuth><ProfilePage /></RequireAuth> },

      { path: 'orgs', element: <RequireAuth><MyOrgsPage /></RequireAuth> },
      { path: 'orgs/new', element: <RequireAuth><OrgCreatePage /></RequireAuth> },
      { path: 'org/:orgId', element: <RequireAuth><RequireOrgRole><OrgPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/opportunities/new', element: <RequireAuth><RequireOrgRole><OpportunityEditorPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/opportunities/:oppId', element: <RequireAuth><RequireOrgRole><OpportunityEditorPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/shifts/:shiftId', element: <RequireAuth><RequireOrgRole><ShiftManagePage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/team', element: <RequireAuth><RequireOrgRole adminOnly><OrgTeamPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/audit', element: <RequireAuth><RequireOrgRole adminOnly><AuditPage /></RequireOrgRole></RequireAuth> },

      { path: 'admin', element: <RequireAuth><RequirePlatformAdmin><AdminPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/audit', element: <RequireAuth><RequirePlatformAdmin><AuditPage /></RequirePlatformAdmin></RequireAuth> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
