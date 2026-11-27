import { lazy } from 'react'
import { createBrowserRouter, redirect } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { AdminWorkspace, OrgWorkspace, VolunteerWorkspace } from '../components/layout/WorkspaceLayout'
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
const EventsPage = page(() => import('../pages/EventsPages'), 'EventsPage')
const EventDetailPage = page(() => import('../pages/EventsPages'), 'EventDetailPage')
const MyShiftsPage = page(() => import('../pages/MyShiftsPage'), 'MyShiftsPage')
const RecordPage = page(() => import('../pages/RecordPage'), 'RecordPage')
const CalendarPage = page(() => import('../pages/CalendarPage'), 'CalendarPage')
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
const MapPage = page(() => import('../pages/MapPages'), 'MapPage')
const EmergencyPage = page(() => import('../pages/MapPages'), 'EmergencyPage')
const MediaPage = page(() => import('../pages/MapPages'), 'MediaPage')
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
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:id', element: <EventDetailPage /> },
      { path: 'map', element: <MapPage /> },
      { path: 'emergency', element: <EmergencyPage /> },
      { path: 'media', element: <MediaPage /> },
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

      // Volunteer workspace: a layout route (sidebar shell). URLs are unchanged.
      {
        path: 'me',
        element: <RequireAuth><VolunteerWorkspace /></RequireAuth>,
        children: [
          { index: true, element: <MyShiftsPage /> },
          { path: 'record', element: <RecordPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'applications', element: <MyApplicationsPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'complaints', element: <ComplaintsPage /> },
        ],
      },
      // Printable certificate stays outside the workspace shell.
      { path: 'me/certificate/:id', element: <RequireAuth><CertificatePage /></RequireAuth> },

      { path: 'orgs', element: <RequireAuth><MyOrgsPage /></RequireAuth> },
      { path: 'orgs/new', element: <RequireAuth><OrgCreatePage /></RequireAuth> },
      // Organization workspace: members only (same guard as before); admin-only pages keep their own guard.
      {
        path: 'org/:orgId',
        element: <RequireAuth><RequireOrgRole><OrgWorkspace /></RequireOrgRole></RequireAuth>,
        children: [
          { index: true, element: <OrgPage /> },
          { path: 'opportunities/new', element: <OpportunityEditorPage /> },
          { path: 'opportunities/:oppId', element: <OpportunityEditorPage /> },
          { path: 'shifts/:shiftId', element: <ShiftManagePage /> },
          { path: 'applications', element: <OrgApplicationsPage /> },
          { path: 'settings', element: <RequireOrgRole adminOnly><OrgSettingsPage /></RequireOrgRole> },
          { path: 'team', element: <RequireOrgRole adminOnly><OrgTeamPage /></RequireOrgRole> },
          { path: 'audit', element: <RequireOrgRole adminOnly><AuditPage /></RequireOrgRole> },
        ],
      },

      // Platform administration: a layout route behind the same guards. URLs are unchanged.
      {
        path: 'admin',
        element: <RequireAuth><RequirePlatformAdmin><AdminWorkspace /></RequirePlatformAdmin></RequireAuth>,
        children: [
          { index: true, element: <AdminOverviewPage /> },
          { path: 'organizations', element: <AdminPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'opportunities', element: <AdminOpportunitiesPage /> },
          { path: 'complaints', element: <AdminComplaintsPage /> },
          { path: 'feedback', element: <AdminFeedbackPage /> },
          { path: 'audit', element: <AuditPage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
