import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { LoadingState } from '../ui'

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-700 hover:bg-black/5'}`

export function AppShell() {
  const { session, profile, memberships, isPlatformAdmin, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const nav = (
    <>
      <NavLink to="/explore" className={linkCls} onClick={() => setOpen(false)}>Explore</NavLink>
      {session && <NavLink to="/me" className={linkCls} onClick={() => setOpen(false)}>My shifts</NavLink>}
      {session && (
        <NavLink to="/orgs" className={linkCls} onClick={() => setOpen(false)}>
          Organizations{memberships.length ? ` (${memberships.length})` : ''}
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
                <Link to="/me/profile" className="max-w-40 truncate text-sm text-ink-700 hover:underline">{profile?.full_name ?? 'Profile'}</Link>
                <button type="button" className="rounded-md px-2.5 py-1.5 text-sm text-ink-700 hover:bg-black/5"
                  onClick={async () => { await signOut(); navigate('/') }}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/signin" className="rounded-md px-2.5 py-1.5 text-sm text-ink-700 hover:bg-black/5">Sign in</Link>
                <Link to="/signup" className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">Join</Link>
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
                <NavLink to="/me/profile" className={linkCls} onClick={() => setOpen(false)}>Profile</NavLink>
                <button type="button" className="rounded-md px-2.5 py-1.5 text-left text-sm text-ink-700"
                  onClick={async () => { setOpen(false); await signOut(); navigate('/') }}>Sign out</button>
              </>
            ) : (
              <>
                <NavLink to="/signin" className={linkCls} onClick={() => setOpen(false)}>Sign in</NavLink>
                <NavLink to="/signup" className={linkCls} onClick={() => setOpen(false)}>Join</NavLink>
              </>
            )}
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-500 sm:px-6">Worldkin Roster · Everyone is kin.</div>
      </footer>
    </div>
  )
}
