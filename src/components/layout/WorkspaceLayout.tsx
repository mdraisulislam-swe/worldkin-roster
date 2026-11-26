import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { getAdminOverview, getMyApplications, getOrgApplications, getUnreadCount } from '../../lib/platform'
import { ADMIN_NAV, VOLUNTEER_NAV, orgNav, type NavItem } from '../../lib/nav'
import { VOLUNTEER_SHARED_PATHS } from '../../lib/workspace'
import { Icon } from '../Icon'

/**
 * Workspace app shell (prototype "shell"): full-height sidebar with logo, an
 * optional organization block, the section menu with count badges and the
 * user card + Sign out; a slim top bar (page name, Find opportunities, bell);
 * a bottom tab bar and a slide-out menu below the lg breakpoint.
 *
 * These are layout routes: URLs, guards and page queries are unchanged. The
 * AppShell hides the public header/footer for these paths (lib/workspace.ts).
 * Counts reuse queries the pages already make (same keys, shared cache).
 * Navigation is UX only; every page is still authorized by the database.
 */

type Who = { name: string; role: string }
type FrameProps = {
  kind: 'volunteer' | 'org' | 'admin'
  label: string
  items: NavItem[]
  who: Who
  orgBlock?: ReactNode
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·'

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 whitespace-nowrap font-display text-lg font-bold ${dark ? 'text-white' : 'text-forest-900'}`}>
      <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand-700 text-white"><Icon name="users" size={18} /></span>
      <span>Worldkin Roster</span>
    </Link>
  )
}

function SideLink({ item, dark, onNavigate }: { item: NavItem; dark: boolean; onNavigate?: () => void }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate}
      className={({ isActive }) => `flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14.5px] font-medium transition-colors ${dark
        ? (isActive ? 'bg-white/12 text-white' : 'text-[#d4e6df] hover:bg-white/6')
        : (isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-neutral-100')}`}>
      {item.icon && <Icon name={item.icon} size={18} />}
      <span className="flex-1">{item.label}</span>
      {!!item.badge && <span className="rounded-full bg-terracotta-700 px-[7px] text-xs font-semibold leading-5 text-white">{item.badge > 99 ? '99+' : item.badge}<span className="sr-only"> pending</span></span>}
    </NavLink>
  )
}

function SidebarBody({ kind, label, items, who, orgBlock, onNavigate }: FrameProps & { onNavigate?: () => void }) {
  const dark = kind === 'admin'
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const group = `px-2.5 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${dark ? 'text-[#7fa59a]' : 'text-ink-500'}`
  return (
    <div className="flex h-full flex-col gap-1 px-3.5 py-5">
      <div className="px-2 pb-4"><Logo dark={dark} /></div>
      {orgBlock}
      <p className={group}>Workspace</p>
      <nav aria-label={label}>
        <ul className="flex flex-col gap-0.5">{items.map((i) => <li key={i.to}><SideLink item={i} dark={dark} onNavigate={onNavigate} /></li>)}</ul>
      </nav>
      <div className={`mt-auto border-t pt-3 ${dark ? 'border-white/10' : 'border-neutral-100'}`}>
        <div className="flex items-center gap-3 p-2">
          <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${dark ? 'bg-white/12 text-white' : 'bg-brand-50 text-brand-700'}`}>{initials(who.name)}</span>
          <span className="flex min-w-0 flex-col">
            <span className={`truncate text-sm font-semibold leading-tight ${dark ? 'text-white' : 'text-ink-900'}`} title={who.name}>{who.name}</span>
            <span className={`text-xs ${dark ? 'text-[#7fa59a]' : 'text-ink-500'}`}>{who.role}</span>
          </span>
        </div>
        {/* Same sign-out behaviour as the public header (AppShell). */}
        <button type="button" onClick={async () => { onNavigate?.(); await signOut(); navigate('/') }}
          className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14.5px] font-medium ${dark ? 'text-[#d4e6df] hover:bg-white/6' : 'text-ink-700 hover:bg-neutral-100'}`}>
          <Icon name="log-out" size={18} />Sign out
        </button>
      </div>
    </div>
  )
}

function WorkspaceFrame(props: FrameProps) {
  const { kind, items, label } = props
  const dark = kind === 'admin'
  const { session } = useAuth()
  const { pathname } = useLocation()
  const uid = session?.user.id
  // Same query key as the header bell elsewhere: shared cache, no extra request.
  const unread = useQuery({ queryKey: ['unread', uid, pathname], queryFn: () => getUnreadCount(uid!), enabled: !!uid, refetchInterval: 60_000, staleTime: 15_000 }).data ?? 0
  // The menu belongs to the page it was opened on, so navigating closes it (no effect needed).
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  // Escape closes the slide-out menu and focus returns to the menu button.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector<HTMLElement>('a,button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenOn(null) }
    window.addEventListener('keydown', onKey)
    const btn = menuBtnRef.current
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); btn?.focus() }
  }, [open])

  const current = items.find((i) => matchPath({ path: i.to, end: !!i.end }, pathname))
  const title = current?.label ?? label

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:max-[1099px]:grid-cols-[220px_minmax(0,1fr)]">
      <aside aria-label={`${label} sidebar`} className={`sticky top-0 hidden h-dvh overflow-y-auto lg:block print:hidden ${dark ? 'bg-forest-900 text-[#cfe1da]' : 'border-r border-neutral-100 bg-white'}`}>
        <SidebarBody {...props} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-neutral-100 bg-white px-4 sm:px-7 print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button ref={menuBtnRef} type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-100 bg-white lg:hidden"
              aria-label="Open menu" aria-expanded={open} aria-controls="workspace-drawer" onClick={() => setOpen(true)}>
              <Icon name="menu" />
            </button>
            <span className="lg:hidden"><Logo /></span>
            <span className="hidden truncate text-sm text-ink-500 lg:block">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            {kind !== 'admin' && (
              <Link to="/explore" className="hidden min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:inline-flex">
                <Icon name="search" size={16} />Find opportunities
              </Link>
            )}
            <Link to="/me/notifications" className="relative grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-neutral-100" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
              <Icon name="bell" />
              {unread > 0 && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-terracotta-700" />}
            </Link>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col px-4 pb-24 pt-5 outline-none sm:px-7 sm:pt-7 lg:pb-8">
          <Outlet />
        </main>

        {/* Phones and tablets: first five sections as a bottom tab bar (prototype "bottom-nav"). */}
        <nav aria-label={`${label} quick links`} className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-neutral-100 bg-white px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 lg:hidden print:hidden">
          {items.slice(0, 5).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}
              className={({ isActive }) => `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-medium ${isActive ? 'text-brand-700' : 'text-ink-500'}`}>
              {i.icon && <Icon name={i.icon} size={20} />}
              <span className="max-w-full truncate">{i.label.split(/[ &]/)[0]}</span>
              {!!i.badge && <span aria-hidden className="absolute right-[calc(50%-18px)] top-0.5 h-2 w-2 rounded-full bg-terracotta-700" />}
            </NavLink>
          ))}
        </nav>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={`${label} menu`} id="workspace-drawer">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div ref={drawerRef} className={`absolute inset-y-0 left-0 w-[min(300px,85vw)] overflow-y-auto shadow-xl ${dark ? 'bg-forest-900 text-[#cfe1da]' : 'bg-white'}`}>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}
              className={`absolute right-3 top-4 grid h-10 w-10 place-items-center rounded-lg ${dark ? 'text-white hover:bg-white/10' : 'text-ink-700 hover:bg-neutral-100'}`}>
              <Icon name="x" />
            </button>
            <SidebarBody {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

export function VolunteerWorkspace() {
  const { session, profile, memberships } = useAuth()
  const { pathname } = useLocation()
  const uid = session?.user.id
  const unread = useQuery({ queryKey: ['unread', uid, pathname], queryFn: () => getUnreadCount(uid!), enabled: !!uid, refetchInterval: 60_000, staleTime: 15_000 }).data ?? 0
  // Same key as the Applications page: shared cache.
  const apps = useQuery({ queryKey: ['my-applications'], queryFn: getMyApplications, enabled: !!uid })
  const pendingOffers = (apps.data ?? []).filter((a) => a.offer_status === 'pending').length
  // Existing rule: profile and complaints show no volunteer workspace to organization staff.
  if (VOLUNTEER_SHARED_PATHS.includes(pathname.replace(/\/$/, '')) && memberships.length > 0) return <Outlet />
  const items = VOLUNTEER_NAV.map((i) => (i.to === '/me/notifications' ? { ...i, badge: unread } : i.to === '/me/applications' ? { ...i, badge: pendingOffers } : i))
  return <WorkspaceFrame kind="volunteer" label="Volunteer dashboard" items={items} who={{ name: profile?.full_name || 'Volunteer', role: 'Volunteer' }} />
}

const ROLE_LABEL = { org_admin: 'Organization admin', coordinator: 'Coordinator' } as const
const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  verified: { text: 'Verified', cls: 'bg-brand-50 text-brand-800' },
  pending: { text: 'Awaiting verification', cls: 'bg-amber-50 text-amber-900' },
  rejected: { text: 'Not approved', cls: 'bg-rose-50 text-rose-800' },
  suspended: { text: 'Suspended', cls: 'bg-rose-50 text-rose-800' },
}

export function OrgWorkspace() {
  const { orgId = '' } = useParams()
  const { profile, memberships, roleIn } = useAuth()
  const m = memberships.find((x) => x.org_id === orgId)
  const role = roleIn(orgId)
  // Same rule the pages used before: admin links for organization admins only.
  const isAdmin = role === 'org_admin'
  const org = m?.organization
  const status = org ? STATUS_CHIP[org.status] : undefined
  // Same key as the organization overview: shared cache.
  const submitted = useQuery({ queryKey: ['org-app-count', orgId, 'submitted'], queryFn: () => getOrgApplications(orgId, undefined, 'submitted'), enabled: !!role })
  const items = orgNav(orgId, isAdmin).map((i) => (i.to === `/org/${orgId}/applications` ? { ...i, badge: submitted.data?.length ?? 0 } : i))
  const orgName = org?.name ?? 'Organization'
  const orgBlock = (
    <>
      <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">Organization</p>
      <div className="flex items-start gap-2.5 rounded-lg px-2.5 py-2">
        <span aria-hidden className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] bg-brand-50 font-display text-xs font-bold text-brand-700">{initials(orgName)}</span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-semibold leading-tight text-ink-900" title={orgName}>{orgName}</span>
          {status && <span className={`w-fit rounded-full px-2 text-[11px] font-semibold leading-5 ${status.cls}`}>{status.text}</span>}
          {memberships.length > 1 && <Link to="/orgs" className="text-xs text-ink-500 hover:text-brand-700 hover:underline">Switch organization</Link>}
          {org?.status === 'verified' && <Link to={`/organizations/${org.slug}`} className="text-xs text-ink-500 hover:text-brand-700 hover:underline">Public profile</Link>}
        </span>
      </div>
    </>
  )
  return <WorkspaceFrame kind="org" label="Organization dashboard" items={items} orgBlock={orgBlock}
    who={{ name: profile?.full_name || 'Staff member', role: role ? ROLE_LABEL[role] : 'Platform admin' }} />
}

export function AdminWorkspace() {
  const { profile } = useAuth()
  // Same key as the admin overview page: shared cache.
  const ov = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview })
  const items = ADMIN_NAV.map((i) => (i.to === '/admin/organizations' ? { ...i, badge: ov.data?.organizations_pending ?? 0 }
    : i.to === '/admin/complaints' ? { ...i, badge: ov.data?.complaints_open ?? 0 } : i))
  return <WorkspaceFrame kind="admin" label="Platform administration" items={items} who={{ name: profile?.full_name || 'Administrator', role: 'Platform admin' }} />
}
