import { NavLink } from 'react-router'
import { VOLUNTEER_NAV, type NavItem } from '../lib/nav'

/** Section navigation inside a dashboard (scrolls horizontally on small screens). */
export function DashboardNav({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto border-b border-black/10 px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink to={i.to} end={i.end}
              className={({ isActive }) => `inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${isActive ? 'border-brand-700 font-medium text-brand-800' : 'border-transparent text-ink-700 hover:text-ink-900'}`}>
              {i.label}
              {!!i.badge && <span className="rounded-full bg-brand-700 px-1.5 text-xs font-semibold text-white">{i.badge}<span className="sr-only"> new</span></span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function VolunteerNav() {
  return <DashboardNav label="Volunteer dashboard" items={VOLUNTEER_NAV} />
}
