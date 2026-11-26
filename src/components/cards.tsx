import { Link } from 'react-router'
import { CAUSE_LABELS, MODE_LABELS, formatDateTime, seatsSummary, spotsLabel, startsIn } from '../lib/format'
import { COMPENSATION_LABELS, ORG_TYPE_LABELS, type CompensationType, type OpportunityCard, type OrgCard } from '../lib/platform'
import { Card } from './ui'
import { Icon } from './Icon'

const pill = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'
/** Neutral fact badge (how to join, timing, seats): outline, no colour, so only pay type and urgency are coloured. */
const fact = `${pill} border border-neutral-100 bg-white text-ink-700`
const COMP_TONE: Record<CompensationType, string> = {
  voluntary: 'bg-brand-50 text-brand-800',
  stipend: 'bg-sky-50 text-sky-900',
  paid: 'bg-terracotta-500/10 text-terracotta-700',
}

export function CompensationBadge({ type }: { type: CompensationType }) {
  return <span className={`${pill} ${COMP_TONE[type]}`}>{COMPENSATION_LABELS[type]}</span>
}

/** Opportunity summary used on Home, Explore and organization pages. */
export function OpportunityCardView({ o, now }: { o: OpportunityCard; now: number }) {
  const spots = spotsLabel(o.open_spots, o.upcoming_shifts)
  const deadlineSoon = o.application_deadline && new Date(o.application_deadline).getTime() - now < 3 * 86_400_000
  return (
    <Card className="flex h-full flex-col transition-colors hover:border-brand-600/40">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">{CAUSE_LABELS[o.cause]} · {MODE_LABELS[o.mode]}</p>
      <h3 className="mt-1.5 text-[17px] font-bold leading-snug text-ink-900"><Link className="hover:text-brand-700 hover:underline" to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
      <p className="text-sm text-ink-500">
        <Link className="hover:underline" to={`/organizations/${o.org_slug}`}>{o.org_name}</Link>
        {/* Public listings exist only for verified organizations (is_opportunity_public). */}
        <span className="ml-1 inline-flex align-[-3px] text-brand-700" title="Verified by Worldkin"><Icon name="shield-check" size={15} /><span className="sr-only"> verified organization</span></span>
        {o.city ? ` · ${o.city}` : ''}{o.country_code ? `, ${o.country_code}` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <CompensationBadge type={o.compensation_type} />
        {o.selection_mode === 'application'
          ? <span className={fact}><Icon name="file-text" size={13} />Apply · selection</span>
          : <span className={fact}><Icon name="check" size={13} />Instant sign-up</span>}
        {o.next_shift_at && <span className={fact}><Icon name="calendar" size={13} />{startsIn(o.next_shift_at, now)}</span>}
        {o.selection_mode === 'open' && spots && <span className={spots.tone === 'warn' ? `${pill} bg-amber-100 text-amber-900` : fact}>{spots.tone === 'warn' && <Icon name="alert" size={13} />}{spots.text}</span>}
      </div>
      <div className="mt-auto pt-4 text-sm text-ink-700"><div className="border-t border-neutral-100 pt-3">
        {o.application_deadline
          ? <p className={deadlineSoon ? 'font-medium text-amber-900' : ''}>Apply by {formatDateTime(o.application_deadline)}</p>
          : <p>Next shift: {o.next_shift_at ? formatDateTime(o.next_shift_at) : 'none scheduled'}</p>}
        {seatsSummary(o.open_spots, o.upcoming_shifts) && <p className="text-ink-500">{seatsSummary(o.open_spots, o.upcoming_shifts)}</p>}
        {o.compensation_type !== 'voluntary' && o.compensation_details && <p className="text-ink-500">{o.compensation_details}</p>}
      </div></div>
    </Card>
  )
}

export function OrgCardView({ o }: { o: OrgCard }) {
  return (
    <Card className="flex h-full gap-3">
      <OrgLogo name={o.name} url={o.logo_url} />
      <div className="min-w-0">
        <h3 className="font-bold leading-snug text-ink-900"><Link className="hover:text-brand-700 hover:underline" to={`/organizations/${o.slug}`}>{o.name}</Link></h3>
        <p className="text-sm text-ink-500">{ORG_TYPE_LABELS[o.org_type]} · {CAUSE_LABELS[o.cause]}</p>
        <p className="text-sm text-ink-500">{o.city ? `${o.city}, ` : ''}{o.country_code}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={`${pill} bg-brand-50 text-brand-800`}><Icon name="shield-check" size={13} />Verified</span>
          <span className={fact}>{o.published_opportunities} open opportunit{o.published_opportunities === 1 ? 'y' : 'ies'}</span>
          {o.review_count > 0 && <span className={`${pill} bg-amber-50 text-amber-900`}>★ {o.average_rating} ({o.review_count})</span>}
        </div>
      </div>
    </Card>
  )
}

export function OrgLogo({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-xl border border-neutral-100 object-cover" style={{ width: size, height: size }} />
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-xl bg-brand-50 font-display font-bold text-brand-800" style={{ width: size, height: size }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Card-shaped placeholder while lists load (reduces layout shift). */
export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="h-40 animate-pulse rounded-xl border border-neutral-100 bg-white/70" />
      ))}
    </ul>
  )
}
