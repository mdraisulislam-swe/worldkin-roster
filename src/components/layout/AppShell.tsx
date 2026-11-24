import { Link, Outlet } from 'react-router'

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink-900">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span>Worldkin Roster</span>
          </Link>
          <nav aria-label="Primary">
            <ul className="flex items-center gap-4 text-sm text-ink-700">
              <li>
                <span className="text-ink-500">Explore (soon)</span>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-500 sm:px-6">
          Worldkin Roster · Everyone is kin.
        </div>
      </footer>
    </div>
  )
}
