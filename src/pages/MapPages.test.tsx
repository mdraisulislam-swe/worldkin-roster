import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// No network, no Supabase client, no Leaflet DOM: data layer and the map widget are mocked.
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => auth.value }))
vi.mock('../lib/platform', () => ({ searchOpportunities: vi.fn(async () => ({ rows: [] })), listOrganizations: vi.fn(async () => ({ rows: [] })) }))
vi.mock('../lib/events', () => ({ getUpcomingEvents: vi.fn(async () => []) }))
vi.mock('../components/WorldMap', () => ({ WorldMap: ({ label }: { label: string }) => <div data-testid="map" aria-label={label} /> }))

import { EmergencyPage, MapPage, MediaPage } from './MapPages'

const render = (ui: ReactNode, path = '/') => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>,
)
const member = (status: string, role = 'org_admin') => ({ org_id: 'o1', role, organization: { name: 'Org', slug: 'org', status } })

describe('MediaPage', () => {
  it('shows a real player shell with a content-required state, never a fake play button', () => {
    const html = render(<MediaPage />)
    expect(html.match(/Video not published yet/g)?.length).toBe(3)
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('Play video')
    expect(html).toContain('Not available yet')
  })
})

describe('EmergencyPage', () => {
  it('always states it is not an emergency service and is not switched on', () => {
    auth.value = { session: null, memberships: [] }
    const html = render(<EmergencyPage />)
    expect(html).toContain('not an emergency service')
    expect(html).toContain('not switched on')
    expect(html).toContain('Sign in as an organization')
    expect(html).not.toContain('Check request')
  })
  it('offers the request form only to admins or coordinators of a verified organization', () => {
    auth.value = { session: { user: { id: 'u' } }, memberships: [member('pending')] }
    expect(render(<EmergencyPage />)).not.toContain('Check request')
    auth.value = { session: { user: { id: 'u' } }, memberships: [member('verified', 'coordinator')] }
    const html = render(<EmergencyPage />)
    expect(html).toContain('Check request')
    expect(html).toContain('No live requests')
    expect(html).not.toMatch(/request (was|has been) sent/i)
  })
})

describe('MapPage', () => {
  it('renders the map region, filters, location button and the honest volunteer-layer note', () => {
    auth.value = { session: null, memberships: [] }
    const html = render(<MapPage />, '/map?country=BD')
    expect(html).toContain('data-testid="map"')
    expect(html).toContain('Use my location')
    expect(html).toContain('<option value="BD" selected="">Bangladesh</option>')
    expect(html).toContain('no volunteer location is shown')
  })
})
