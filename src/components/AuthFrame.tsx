import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** Factual product points only: each one is enforced by the backend today. */
const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'shield-check', text: 'Organizations are verified by Worldkin before they can publish opportunities.' },
  { icon: 'calendar', text: 'Shift seats are allocated safely: two people can never take the last place.' },
  { icon: 'award', text: 'Your hours count only after the organization confirms your attendance.' },
]

/** The prototype's auth photos (Unsplash, free licence), the same source as the home hero. Decorative only. */
const PHOTOS = {
  hero: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?auto=format&fit=crop&w=1000&q=70',
  team: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1000&q=70',
} as const

/**
 * Split auth layout: the form column (with the page's h1) on the left and a
 * Deep Forest panel on wide screens. On phones only the form is shown.
 */
export function AuthFrame({ children, photo }: { children: ReactNode; photo?: keyof typeof PHOTOS }) {
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-12">
      <div className="mx-auto w-full max-w-md lg:py-6">{children}</div>
      <aside aria-label="Why Worldkin Roster" className="hidden rounded-[28px] bg-forest-900 p-10 text-sage-200 lg:block">
        {photo && (
          <div className="mb-8 h-56 overflow-hidden rounded-2xl bg-brand-800">
            <img src={PHOTOS[photo]} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-200/80">Worldkin Roster</p>
        <p className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-white">Everyone is kin.</p>
        <p className="mt-3 text-[15px] leading-relaxed">Volunteering, internships and community programmes with organizations you can trust.</p>
        <ul className="mt-8 flex flex-col gap-5">
          {POINTS.map((p) => (
            <li key={p.icon} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white"><Icon name={p.icon} size={18} /></span>
              <span className="text-[15px] leading-relaxed">{p.text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
