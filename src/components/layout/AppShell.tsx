import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { CONFIRM_PATH, readAuthRedirectError } from '../../lib/authRedirect'
import { useQuery } from '@tanstack/react-query'
import { getUnreadCount } from '../../lib/platform'
import { LoadingState } from '../ui'

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-700 hover:bg-black/5'}`

export function AppShell() {
  const { session, profile, memberships, isPlatformAdmin, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const uid = session?.user.id
  // Unread count: small HEAD count query, refreshed every minute and on navigation.
  const unreadQ = useQuery({ queryKey: ['unread', uid, pathname], queryFn: () => getUnreadCount(uid!), enabled: !!uid, refetchInterval: 60_000, staleTime: 15_000 })
  const unread = unreadQ.data ?? 0
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  // After client-side navigation, move focus to the new page content so keyboard
  // and screen-reader users start at the top of it (not on the old link).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [pathname])
  // A confirmation link that fails (expired / already used) may land on any page,
  // e.g. the Site URL root. Route it to the confirmation page, which explains it.
  useEffect(() => {
    if (pathname !== CONFIRM_PATH && pathname !== '/auth/reset' && readAuthRedirectError(window.location.hash, '')) {
      navigate(CONFIRM_PATH + window.location.hash, { replace: true })
    }
  }, [pathname, navigate])
  // Tab title follows the page heading (pages load lazily, so watch for it),
  // letting screen-reader and multi-tab users know where they are.
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const sync = () => {
      const h1 = main.querySelector('h1')?.textContent?.trim()
      document.title = pathname === '/' || !h1 ? 'Worldkin Roster — Everyone is kin.' : h1 + ' · Worldkin Roster'
    }
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(main, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [pathname])

  const nav = (
    <>
      <NavLink to="/explore" className={linkCls} onClick={() => setOpen(false)}>Explore</NavLink>
      <NavLink to="/organizations" end className={linkCls} onClick={() => setOpen(false)}>Organizations</NavLink>
      {session && <NavLink to="/me" className={linkCls} onClick={() => setOpen(false)}>My dashboard</NavLink>}
      {session && (
        <NavLink to="/orgs" className={linkCls} onClick={() => setOpen(false)}>
          My organizations{memberships.length ? ` (${memberships.length})` : ''}
        </NavLink>
      )}
      {isPlatformAdmin && <NavLink to="/admin" className={linkCls} onClick={() => setOpen(false)}>Admin</NavLink>}
    </>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to main content
      </a>
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold text-ink-900">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span>Worldkin Roster</span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">{nav}</nav>
          <div className="hidden items-center gap-2 md:flex">
            {session ? (
              <>
                <Link to="/me/notifications" className="relative rounded-md px-2 py-1.5 text-sm text-ink-700 hover:bg-black/5" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
                  <span aria-hidden>🔔</span>
                  {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
                </Link>
                <Link to="/me/profile" className="max-w-40 truncate text-sm text-ink-700 hover:underline">{profile?.full_name ?? 'Profile'}</Link>
                <button type="button" className="rounded-md px-2.5 py-1.5 text-sm text-ink-700 hover:bg-black/5"
                  onClick={async () => { await signOut(); navigate('/') }}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/signin" className="rounded-md px-2.5 py-1.5 text-sm text-ink-700 hover:bg-black/5">Sign in</Link>
                <Link to="/join" className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">Join</Link>
              </>
            )}
          </div>
          <button type="button" className="rounded-md border border-black/15 px-3 py-1.5 text-sm md:hidden"
            aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
            Menu
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="flex flex-col gap-1 border-t border-black/10 px-4 py-3 md:hidden">
            {nav}
            {session ? (
              <>
                <NavLink to="/me/notifications" className={linkCls} onClick={() => setOpen(false)}>Notifications{unread ? ` (${unread})` : ''}</NavLink>
                <NavLink to="/me/profile" className={linkCls} onClick={() => setOpen(false)}>Profile</NavLink>
                <button type="button" className="rounded-md px-2.5 py-1.5 text-left text-sm text-ink-700"
                  onClick={async () => { setOpen(false); await signOut(); navigate('/') }}>Sign out</button>
              </>
            ) : (
              <>
                <NavLink to="/signin" className={linkCls} onClick={() => setOpen(false)}>Sign in</NavLink>
                <NavLink to="/join" className={linkCls} onClick={() => setOpen(false)}>Join</NavLink>
              </>
            )}
          </nav>
        )}
      </header>
      {!online && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          You are offline. You can keep browsing what is loaded; changes will need a connection. The page updates automatically when you are back online.
        </div>
      )}
      <main id="main" ref={mainRef} tabIndex={-1} className="outline-none mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-500 sm:px-6">
          <span>Worldkin Roster · Everyone is kin.</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link className="hover:underline" to="/explore">Opportunities</Link>
            <Link className="hover:underline" to="/organizations">Organizations</Link>
            <Link className="hover:underline" to="/join">Join</Link>
            <Link className="hover:underline" to="/me/complaints">Report a concern</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
