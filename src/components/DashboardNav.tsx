import { NavLink } from 'react-router'
import type { NavItem } from '../lib/nav'
import { Icon } from './Icon'

/**
 * Section tabs for the platform-admin pages (volunteer and organization areas
 * use WorkspaceLayout). Same pill style as the workspace tab row; scrolls
 * horizontally on small screens.
 */
export function DashboardNav({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-2">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink to={i.to} end={i.end}
              className={({ isActive }) => `inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium ${isActive
                ? 'border-forest-900 bg-forest-900 text-white'
                : 'border-neutral-100 bg-white text-ink-700 hover:border-brand-600'}`}>
              {i.icon && <Icon name={i.icon} size={16} />}
              {i.label}
              {!!i.badge && <span className="rounded-full bg-terracotta-700 px-1.5 text-xs font-semibold leading-5 text-white">{i.badge}<span className="sr-only"> new</span></span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
