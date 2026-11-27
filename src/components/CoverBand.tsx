import type { ReactNode } from 'react'
import type { Enums } from '../lib/database.types'
import { CAUSE_LABELS } from '../lib/format'
import { Icon, type IconName } from './Icon'

/**
 * Visual header for an opportunity, in place of the prototype's cover photo.
 * Listings have no photos in the database, so this shows the cause (colour +
 * icon) instead of a stock image that could be mistaken for the real activity.
 */
const CAUSE_STYLE: Record<Enums<'cause_category'>, { icon: IconName; bg: string }> = {
  humanitarian: { icon: 'heart', bg: 'from-forest-900 to-brand-700' },
  disaster_response: { icon: 'alert', bg: 'from-[#5b2a14] to-terracotta-700' },
  refugee_support: { icon: 'users', bg: 'from-[#1e3a5f] to-[#2f6690]' },
  conflict_relief: { icon: 'shield-check', bg: 'from-[#3b3355] to-[#5c5285]' },
  food_security: { icon: 'heart', bg: 'from-[#6b3d10] to-[#a9531c]' },
  health: { icon: 'heart', bg: 'from-[#5d1f3a] to-[#9c3b62]' },
  education: { icon: 'book', bg: 'from-[#1e3a5f] to-[#1f6f8b]' },
  environment: { icon: 'leaf', bg: 'from-forest-900 to-natural-500' },
  climate: { icon: 'globe', bg: 'from-[#0c3b36] to-[#1f7a6d]' },
  community_development: { icon: 'home', bg: 'from-forest-900 to-brand-600' },
  social_welfare: { icon: 'users', bg: 'from-[#2d3b2a] to-[#4d6b3c]' },
  other: { icon: 'briefcase', bg: 'from-[#2b3340] to-[#4a5566]' },
}

export function CoverBand({ cause, tag, className = 'h-28' }: { cause: Enums<'cause_category'>; tag?: ReactNode; className?: string }) {
  const s = CAUSE_STYLE[cause] ?? CAUSE_STYLE.other
  return (
    <div aria-hidden className={`relative overflow-hidden bg-gradient-to-br ${s.bg} ${className}`}>
      <Icon name={s.icon} size={140} className="absolute -right-4 -bottom-8 text-white/10" />
      <span className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white/85">
        <Icon name={s.icon} size={14} />{CAUSE_LABELS[cause]}
      </span>
      {tag && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-ink-900">{tag}</span>}
    </div>
  )
}
