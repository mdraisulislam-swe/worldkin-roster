import { describe, expect, it } from 'vitest'
import { workspaceChrome, type ChromeInput } from './workspace'

const base: ChromeInput = { pathname: '/', loading: false, signedIn: true, isPlatformAdmin: false, memberOrgIds: [] }
const c = (p: Partial<ChromeInput>) => workspaceChrome({ ...base, ...p })

describe('workspaceChrome', () => {
  it('public pages keep the public header and footer', () => {
    for (const pathname of ['/', '/explore', '/events', '/organizations/x', '/signin', '/orgs', '/orgs/new', '/dashboard']) expect(c({ pathname })).toBe('public')
  })
  it('volunteer pages use the volunteer shell', () => {
    for (const pathname of ['/me', '/me/', '/me/applications', '/me/calendar', '/me/record', '/me/notifications']) expect(c({ pathname })).toBe('volunteer')
  })
  it('the printable certificate stays outside the shell', () => {
    expect(c({ pathname: '/me/certificate/abc' })).toBe('public')
  })
  it('keeps the existing rule for profile and complaints', () => {
    expect(c({ pathname: '/me/profile' })).toBe('volunteer')
    expect(c({ pathname: '/me/profile', memberOrgIds: ['11111111-2222-3333-4444-555555555555'] })).toBe('public')
    expect(c({ pathname: '/me/complaints', memberOrgIds: ['11111111-2222-3333-4444-555555555555'] })).toBe('public')
  })
  it('organization shell only for members of that organization (or platform admins)', () => {
    expect(c({ pathname: '/org/11111111-2222-3333-4444-555555555555', memberOrgIds: ['11111111-2222-3333-4444-555555555555'] })).toBe('org')
    expect(c({ pathname: '/org/11111111-2222-3333-4444-555555555555/settings', memberOrgIds: ['11111111-2222-3333-4444-555555555555'] })).toBe('org')
    expect(c({ pathname: '/org/99999999-8888-7777-6666-555555555555', memberOrgIds: ['11111111-2222-3333-4444-555555555555'] })).toBe('public')
    expect(c({ pathname: '/org/99999999-8888-7777-6666-555555555555', isPlatformAdmin: true })).toBe('org')
  })
  it('admin shell only for platform admins; others keep public chrome around "No access"', () => {
    expect(c({ pathname: '/admin', isPlatformAdmin: true })).toBe('admin')
    expect(c({ pathname: '/admin/users', isPlatformAdmin: true })).toBe('admin')
    expect(c({ pathname: '/admin' })).toBe('public')
    expect(c({ pathname: '/admin/audit', memberOrgIds: ['11111111-2222-3333-4444-555555555555'] })).toBe('public')
  })
  it('signed out: public chrome while the guard redirects to sign-in', () => {
    expect(c({ pathname: '/me', signedIn: false })).toBe('public')
    expect(c({ pathname: '/admin', signedIn: false, isPlatformAdmin: false })).toBe('public')
  })
  it('while the session loads: no public chrome flash on workspace paths', () => {
    expect(c({ pathname: '/me', loading: true })).toBe('pending')
    expect(c({ pathname: '/', loading: true })).toBe('public')
  })
  it('lookalike paths are not workspaces', () => {
    for (const pathname of ['/metrics', '/organization', '/administrator', '/orgs/x']) expect(c({ pathname })).toBe('public')
  })
})

describe('malformed organization ids (smoke-test D2)', () => {
  it('keep the public chrome, even for platform admins', () => {
    expect(workspaceChrome({ ...base, pathname: '/org/not-a-uuid/team', isPlatformAdmin: true })).toBe('public')
  })
})
