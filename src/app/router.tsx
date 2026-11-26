import { lazy } from 'react'
import { createBrowserRouter, redirect } from 'react-router'
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
const AuthConfirmedPage = page(() => import('../pages/AuthPages'), 'AuthConfirmedPage')
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
const JoinPage = page(() => import('../pages/AuthPages'), 'JoinPage')
const VerifyEmailPage = page(() => import('../pages/AuthPages'), 'VerifyEmailPage')
const DashboardRedirect = page(() => import('../pages/AuthPages'), 'DashboardRedirect')
const ForgotPasswordPage = page(() => import('../pages/AuthPages'), 'ForgotPasswordPage')
const ResetPasswordPage = page(() => import('../pages/AuthPages'), 'ResetPasswordPage')
const OrganizationsPage = page(() => import('../pages/OrganizationsPages'), 'OrganizationsPage')
const OrganizationProfilePage = page(() => import('../pages/OrganizationsPages'), 'OrganizationProfilePage')
const MyApplicationsPage = page(() => import('../pages/VolunteerPages'), 'MyApplicationsPage')
const NotificationsPage = page(() => import('../pages/VolunteerPages'), 'NotificationsPage')
const ComplaintsPage = page(() => import('../pages/VolunteerPages'), 'ComplaintsPage')
const CertificatePage = page(() => import('../pages/VolunteerPages'), 'CertificatePage')
const OrgApplicationsPage = page(() => import('../pages/OrgPlatformPages'), 'OrgApplicationsPage')
const OrgSettingsPage = page(() => import('../pages/OrgPlatformPages'), 'OrgSettingsPage')
const AdminOverviewPage = page(() => import('../pages/AdminPlatformPages'), 'AdminOverviewPage')
const AdminUsersPage = page(() => import('../pages/AdminPlatformPages'), 'AdminUsersPage')
const AdminOpportunitiesPage = page(() => import('../pages/AdminPlatformPages'), 'AdminOpportunitiesPage')
const AdminComplaintsPage = page(() => import('../pages/AdminPlatformPages'), 'AdminComplaintsPage')
const AdminFeedbackPage = page(() => import('../pages/AdminPlatformPages'), 'AdminFeedbackPage')

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
      { path: 'auth/confirmed', element: <AuthConfirmedPage /> },
      { path: 'auth/reset', element: <ResetPasswordPage /> },
      { path: 'join', element: <JoinPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'dashboard', element: <DashboardRedirect /> },
      { path: 'organizations', element: <OrganizationsPage /> },
      { path: 'organizations/:slug', element: <OrganizationProfilePage /> },
      // /login is a common guess for the sign-in page; keep ?next= when redirecting.
      { path: 'login', loader: ({ request }) => redirect('/signin' + new URL(request.url).search) },

      { path: 'me', element: <RequireAuth><MyShiftsPage /></RequireAuth> },
      { path: 'me/record', element: <RequireAuth><RecordPage /></RequireAuth> },
      { path: 'me/profile', element: <RequireAuth><ProfilePage /></RequireAuth> },
      { path: 'me/applications', element: <RequireAuth><MyApplicationsPage /></RequireAuth> },
      { path: 'me/notifications', element: <RequireAuth><NotificationsPage /></RequireAuth> },
      { path: 'me/complaints', element: <RequireAuth><ComplaintsPage /></RequireAuth> },
      { path: 'me/certificate/:id', element: <RequireAuth><CertificatePage /></RequireAuth> },

      { path: 'orgs', element: <RequireAuth><MyOrgsPage /></RequireAuth> },
      { path: 'orgs/new', element: <RequireAuth><OrgCreatePage /></RequireAuth> },
      { path: 'org/:orgId', element: <RequireAuth><RequireOrgRole><OrgPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/opportunities/new', element: <RequireAuth><RequireOrgRole><OpportunityEditorPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/opportunities/:oppId', element: <RequireAuth><RequireOrgRole><OpportunityEditorPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/shifts/:shiftId', element: <RequireAuth><RequireOrgRole><ShiftManagePage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/applications', element: <RequireAuth><RequireOrgRole><OrgApplicationsPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/settings', element: <RequireAuth><RequireOrgRole adminOnly><OrgSettingsPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/team', element: <RequireAuth><RequireOrgRole adminOnly><OrgTeamPage /></RequireOrgRole></RequireAuth> },
      { path: 'org/:orgId/audit', element: <RequireAuth><RequireOrgRole adminOnly><AuditPage /></RequireOrgRole></RequireAuth> },

      { path: 'admin', element: <RequireAuth><RequirePlatformAdmin><AdminOverviewPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/organizations', element: <RequireAuth><RequirePlatformAdmin><AdminPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/users', element: <RequireAuth><RequirePlatformAdmin><AdminUsersPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/opportunities', element: <RequireAuth><RequirePlatformAdmin><AdminOpportunitiesPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/complaints', element: <RequireAuth><RequirePlatformAdmin><AdminComplaintsPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/feedback', element: <RequireAuth><RequirePlatformAdmin><AdminFeedbackPage /></RequirePlatformAdmin></RequireAuth> },
      { path: 'admin/audit', element: <RequireAuth><RequirePlatformAdmin><AuditPage /></RequirePlatformAdmin></RequireAuth> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
