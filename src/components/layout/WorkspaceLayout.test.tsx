import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Auth state is mocked per test; the data layer is mocked so no network or Supabase client is created.
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth.value }))
vi.mock('../../lib/platform', () => ({
  getUnreadCount: vi.fn(async () => 0), getMyApplications: vi.fn(async () => []),
  getOrgApplications: vi.fn(async () => []), getAdminOverview: vi.fn(async () => null),
}))

import { AdminWorkspace, OrgWorkspace, VolunteerWorkspace } from './WorkspaceLayout'

type M = { org_id: string; role: 'org_admin' | 'coordinator'; organization: { name: string; slug: string; status: string } }
function setAuth(memberships: M[], isPlatformAdmin = false) {
  auth.value = {
    loading: false, signOut: vi.fn(), session: { user: { id: 'u1' } }, profile: { full_name: 'Test Volunteer' }, memberships, isPlatformAdmin,
    roleIn: (id: string) => memberships.find((m) => m.org_id === id)?.role ?? null,
  }
}
const org = (role: M['role'], status = 'verified'): M => ({ org_id: '11111111-2222-3333-4444-555555555555', role, organization: { name: 'Sample Org', slug: 'sample-org', status } })

function render(path: string) {
  const qc = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/me" element={<VolunteerWorkspace />}>
            <Route index element={<p>PAGE</p>} />
            <Route path="profile" element={<p>PAGE</p>} />
            <Route path="calendar" element={<p>PAGE</p>} />
          </Route>
          <Route path="/admin" element={<AdminWorkspace />}>
            <Route index element={<p>PAGE</p>} />
          </Route>
          <Route path="/org/:orgId" element={<OrgWorkspace />}>
            <Route index element={<p>PAGE</p>} />
            <Route path="team" element={<p>PAGE</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('VolunteerWorkspace', () => {
  beforeEach(() => setAuth([]))

  it('renders the page inside a labelled volunteer navigation with all sections', () => {
    const html = render('/me/calendar')
    expect(html).toContain('PAGE')
    expect(html).toContain('aria-label="Volunteer dashboard"')
    for (const href of ['/me', '/me/applications', '/me/calendar', '/me/record', '/me/notifications', '/me/complaints', '/me/profile']) {
      expect(html).toContain(`href="${href}"`)
    }
    expect(html).toContain('aria-current="page"')
  })

  it('links to the admin console only for platform admins, never in the menu itself', () => {
    setAuth([], true)
    const html = render('/me')
    expect(html.split('href="/admin"').length - 1).toBe(1)
    setAuth([])
    expect(render('/me')).not.toContain('href="/admin')
  })

  it('keeps the existing rule: profile shows no volunteer menu for organization staff', () => {
    setAuth([org('coordinator')])
    const html = render('/me/profile')
    expect(html).toContain('PAGE')
    expect(html).not.toContain('Volunteer dashboard')
  })

  it('shows the volunteer menu on the profile page for volunteers without an organization', () => {
    expect(render('/me/profile')).toContain('aria-label="Volunteer dashboard"')
  })
})

describe('OrgWorkspace', () => {
  it('shows admin-only sections to organization admins', () => {
    setAuth([org('org_admin')])
    const html = render('/org/11111111-2222-3333-4444-555555555555/team')
    for (const p of ['/org/11111111-2222-3333-4444-555555555555', '/org/11111111-2222-3333-4444-555555555555/applications', '/org/11111111-2222-3333-4444-555555555555/settings', '/org/11111111-2222-3333-4444-555555555555/team', '/org/11111111-2222-3333-4444-555555555555/audit']) expect(html).toContain(`href="${p}"`)
    expect(html).toContain('Sample Org')
    expect(html).toContain('Organization admin')
  })

  it('hides admin-only sections from coordinators', () => {
    setAuth([org('coordinator')])
    const html = render('/org/11111111-2222-3333-4444-555555555555')
    expect(html).toContain('href="/org/11111111-2222-3333-4444-555555555555/applications"')
    for (const p of ['/org/11111111-2222-3333-4444-555555555555/settings', '/org/11111111-2222-3333-4444-555555555555/team', '/org/11111111-2222-3333-4444-555555555555/audit']) expect(html).not.toContain(`href="${p}"`)
  })

  it('organization admins who are not platform admins never get an admin link', () => {
    setAuth([org('org_admin')], false)
    expect(render('/org/11111111-2222-3333-4444-555555555555')).not.toContain('href="/admin')
  })

  it('links to the public profile only when the organization is verified', () => {
    setAuth([org('org_admin', 'pending')])
    const pending = render('/org/11111111-2222-3333-4444-555555555555')
    expect(pending).not.toContain('href="/organizations/sample-org"')
    expect(pending).toContain('Awaiting verification')
    setAuth([org('org_admin', 'verified')])
    expect(render('/org/11111111-2222-3333-4444-555555555555')).toContain('href="/organizations/sample-org"')
  })
})

describe('workspace app shell', () => {
  it('has one main landmark, a sidebar, a top bar with the bell, and Sign out', () => {
    setAuth([])
    const html = render('/me/calendar')
    expect(html.match(/<main /g)?.length).toBe(1)
    expect(html).toContain('id="main"')
    expect(html).toContain('aria-label="Volunteer dashboard sidebar"')
    expect(html).toContain('href="/me/notifications"')
    expect(html).toContain('Sign out')
    expect(html).toContain('Find opportunities')
    expect(html).toContain('aria-label="Open menu"')
    expect(html).toContain('aria-label="Volunteer dashboard quick links"')
  })

  it('shows the user name and role, and the page name in the top bar', () => {
    setAuth([])
    const html = render('/me/calendar')
    expect(html).toContain('Test Volunteer')
    expect(html).toMatch(/>Calendar</)
  })

  it('admin shell: dark sidebar with every admin section, no Find opportunities', () => {
    setAuth([], true)
    const html = render('/admin')
    for (const p of ['/admin', '/admin/organizations', '/admin/users', '/admin/opportunities', '/admin/complaints', '/admin/feedback', '/admin/audit']) expect(html).toContain('href="' + p + '"')
    expect(html).toContain('bg-forest-900')
    expect(html).not.toContain('Find opportunities')
  })

  it('organization shell shows the organization block and the role', () => {
    setAuth([org('coordinator')])
    const html = render('/org/11111111-2222-3333-4444-555555555555')
    expect(html).toContain('Sample Org')
    expect(html).toContain('Coordinator')
  })
})

describe('workspace switcher (smoke-test D1)', () => {
  it('platform admin in the volunteer workspace can open the Admin console', () => {
    setAuth([], true)
    const html = render('/me/calendar')
    expect(html).toContain('Switch to')
    expect(html).toContain('href="/admin"')
  })
  it('ordinary volunteer sees no admin link and no switcher', () => {
    setAuth([])
    const html = render('/me/calendar')
    expect(html).not.toContain('href="/admin"')
    expect(html).not.toContain('Switch to')
  })
  it('organization member in the volunteer workspace can open their organization', () => {
    setAuth([org('coordinator')])
    expect(render('/me/calendar')).toContain('Organization workspace')
  })
  it('admin console links back to the volunteer workspace', () => {
    setAuth([], true)
    expect(render('/admin')).toContain('Volunteer workspace')
  })
})

describe('malformed organization id (smoke-test D2)', () => {
  it('shows Page not found instead of the workspace (no database call)', () => {
    setAuth([], true)
    const html = render('/org/not-a-uuid')
    expect(html).toContain('Page not found')
    expect(html).not.toContain('Organization dashboard sidebar')
  })
})
