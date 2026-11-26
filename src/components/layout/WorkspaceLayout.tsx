import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { getUnreadCount } from '../../lib/platform'
import { VOLUNTEER_NAV, orgNav, type NavItem } from '../../lib/nav'
import { Icon, type IconName } from '../Icon'

/**
 * Workspace shells for the signed-in areas. They are layout routes: URLs,
 * guards and page data are unchanged, and the pages render inside <Outlet />.
 * Navigation here is UX only; every page is still authorized by the database.
 * Platform-admin links never appear in these shells.
 */

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end}
      className={({ isActive }) => `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[14.5px] font-medium transition-colors ${isActive
        ? 'bg-brand-50 text-brand-800 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-700'
        : 'text-ink-700 hover:bg-neutral-100 hover:text-ink-900'}`}>
      {item.icon && <Icon name={item.icon} size={18} className="text-current opacity-80" />}
      <span className="flex-1">{item.label}</span>
      {!!item.badge && <span className="rounded-full bg-brand-700 px-1.5 text-xs font-semibold leading-5 text-white">{item.badge > 9 ? '9+' : item.badge}<span className="sr-only"> unread</span></span>}
    </NavLink>
  )
}

function TabLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end}
      className={({ isActive }) => `inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium ${isActive
        ? 'border-brand-700 bg-brand-700 text-white'
        : 'border-neutral-100 bg-white text-ink-700 hover:border-brand-600'}`}>
      {item.icon && <Icon name={item.icon} size={16} />}
      {item.label}
      {!!item.badge && <span className="rounded-full bg-terracotta-700 px-1.5 text-xs font-semibold leading-5 text-white">{item.badge > 9 ? '9+' : item.badge}<span className="sr-only"> unread</span></span>}
    </NavLink>
  )
}

function Shell({ label, header, items, footer }: { label: string; header: ReactNode; items: NavItem[]; footer?: ReactNode }) {
  const tabs = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // Phones: keep the active section visible in the horizontal tab row (scrolls the row only, never the page).
  useEffect(() => {
    const nav = tabs.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && el) nav.scrollLeft = el.offsetLeft - nav.clientWidth / 2 + el.offsetWidth / 2
  }, [pathname])
  return (
    <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block print:hidden">
        <div className="sticky top-24 flex flex-col gap-4 rounded-2xl border border-neutral-100 bg-white p-4 shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
          {header}
          <nav aria-label={label}>
            <ul className="flex flex-col gap-0.5">{items.map((i) => <li key={i.to}><SideLink item={i} /></li>)}</ul>
          </nav>
          {footer && <div className="border-t border-neutral-100 pt-3">{footer}</div>}
        </div>
      </aside>
      <nav ref={tabs} aria-label={label} className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden print:hidden">
        <ul className="flex min-w-max gap-2">{items.map((i) => <li key={i.to}><TabLink item={i} /></li>)}</ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}

function ShellHeader({ icon, eyebrow, title, chips }: { icon: IconName | string; eyebrow: string; title: string; chips?: ReactNode }) {
  const isIcon = icon.length > 1
  return (
    <div className="flex items-center gap-3 px-1">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-900 font-display font-bold text-white">
        {isIcon ? <Icon name={icon as IconName} size={18} /> : icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">{eyebrow}</p>
        <p className="truncate font-display font-bold text-ink-900" title={title}>{title}</p>
        {chips}
      </div>
    </div>
  )
}

/** Pages that also serve organization staff show the volunteer menu only to people without an organization (existing rule). */
const SHARED_PATHS = ['/me/profile', '/me/complaints']

export function VolunteerWorkspace() {
  const { session, profile, memberships } = useAuth()
  const { pathname } = useLocation()
  const uid = session?.user.id
  // Same query key as the header bell, so this reuses its cached count (no extra request).
  const unread = useQuery({ queryKey: ['unread', uid, pathname], queryFn: () => getUnreadCount(uid!), enabled: !!uid, refetchInterval: 60_000, staleTime: 15_000 }).data ?? 0
  if (SHARED_PATHS.includes(pathname.replace(/\/$/, '')) && memberships.length > 0) return <Outlet />
  const items = VOLUNTEER_NAV.map((i) => (i.to === '/me/notifications' ? { ...i, badge: unread } : i))
  return (
    <Shell label="Volunteer dashboard" items={items}
      header={<ShellHeader icon="user" eyebrow="Volunteer" title={profile?.full_name || 'Your dashboard'} />}
      footer={<Link to="/explore" className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800"><Icon name="search" size={16} />Find opportunities</Link>} />
  )
}

const ROLE_LABEL = { org_admin: 'Admin', coordinator: 'Coordinator' } as const
const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  verified: { text: 'Verified', cls: 'bg-brand-50 text-brand-800' },
  pending: { text: 'Awaiting verification', cls: 'bg-amber-50 text-amber-900' },
  rejected: { text: 'Not approved', cls: 'bg-rose-50 text-rose-800' },
  suspended: { text: 'Suspended', cls: 'bg-rose-50 text-rose-800' },
}

export function OrgWorkspace() {
  const { orgId = '' } = useParams()
  const { memberships, roleIn } = useAuth()
  const m = memberships.find((x) => x.org_id === orgId)
  const role = roleIn(orgId)
  // Same rule the pages used before: admin links for organization admins only.
  const isAdmin = role === 'org_admin'
  const org = m?.organization
  const showFooter = org?.status === 'verified' || memberships.length > 1
  const status = org ? STATUS_CHIP[org.status] : undefined
  return (
    <Shell label="Organization dashboard" items={orgNav(orgId, isAdmin)}
      header={<ShellHeader icon={(org?.name.trim().charAt(0) || 'O').toUpperCase()} eyebrow="Organization" title={org?.name ?? 'Organization'}
        chips={<div className="mt-1 flex flex-wrap gap-1">
          {role && <span className="rounded-full bg-neutral-100 px-2 text-[11px] font-semibold leading-5 text-ink-700">{ROLE_LABEL[role]}</span>}
          {status && <span className={`rounded-full px-2 text-[11px] font-semibold leading-5 ${status.cls}`}>{status.text}</span>}
        </div>} />}
      footer={showFooter && <div className="flex flex-col gap-1 text-sm">
        {org?.status === 'verified' && <Link to={`/organizations/${org.slug}`} className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-ink-700 hover:bg-neutral-100"><Icon name="external-link" size={16} />Public profile</Link>}
        {memberships.length > 1 && <Link to="/orgs" className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-ink-700 hover:bg-neutral-100"><Icon name="arrow-left-right" size={16} />Switch organization</Link>}
      </div>} />
  )
}
