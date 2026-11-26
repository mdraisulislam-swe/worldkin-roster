import { Link } from 'react-router'
import { CAUSE_LABELS, MODE_LABELS, formatDateTime, seatsSummary, spotsLabel, startsIn } from '../lib/format'
import { COMPENSATION_LABELS, ORG_TYPE_LABELS, type CompensationType, type OpportunityCard, type OrgCard } from '../lib/platform'
import { Card } from './ui'

const pill = 'rounded-full px-2 py-0.5 text-xs font-medium'
const COMP_TONE: Record<CompensationType, string> = {
  voluntary: 'bg-slate-100 text-slate-800',
  stipend: 'bg-sky-100 text-sky-900',
  paid: 'bg-violet-100 text-violet-900',
}

export function CompensationBadge({ type }: { type: CompensationType }) {
  return <span className={`${pill} ${COMP_TONE[type]}`}>{COMPENSATION_LABELS[type]}</span>
}

/** Opportunity summary used on Home, Explore and organization pages. */
export function OpportunityCardView({ o, now }: { o: OpportunityCard; now: number }) {
  const spots = spotsLabel(o.open_spots, o.upcoming_shifts)
  const deadlineSoon = o.application_deadline && new Date(o.application_deadline).getTime() - now < 3 * 86_400_000
  return (
    <Card className="flex h-full flex-col">
      <p className="text-xs uppercase tracking-wide text-brand-700">{CAUSE_LABELS[o.cause]} · {MODE_LABELS[o.mode]}</p>
      <h3 className="mt-1 font-semibold leading-snug"><Link className="hover:underline" to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
      <p className="text-sm text-ink-500">
        <Link className="hover:underline" to={`/organizations/${o.org_slug}`}>{o.org_name}</Link>
        {/* Public listings exist only for verified organizations (is_opportunity_public). */}
        <span className="ml-1 text-xs font-medium text-emerald-800" title="Verified by Worldkin">✓<span className="sr-only"> verified organization</span></span>
        {o.city ? ` · ${o.city}` : ''}{o.country_code ? `, ${o.country_code}` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <CompensationBadge type={o.compensation_type} />
        {o.selection_mode === 'application'
          ? <span className={`${pill} bg-amber-50 text-amber-900`}>Apply · selection</span>
          : <span className={`${pill} bg-emerald-50 text-emerald-900`}>Instant sign-up</span>}
        {o.next_shift_at && <span className={`${pill} bg-brand-50 text-brand-800`}>{startsIn(o.next_shift_at, now)}</span>}
        {o.selection_mode === 'open' && spots && <span className={`${pill} ${spots.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'}`}>{spots.text}</span>}
      </div>
      <div className="mt-auto pt-3 text-sm text-ink-700">
        {o.application_deadline
          ? <p className={deadlineSoon ? 'font-medium text-amber-900' : ''}>Apply by {formatDateTime(o.application_deadline)}</p>
          : <p>Next shift: {o.next_shift_at ? formatDateTime(o.next_shift_at) : 'none scheduled'}</p>}
        {seatsSummary(o.open_spots, o.upcoming_shifts) && <p className="text-ink-500">{seatsSummary(o.open_spots, o.upcoming_shifts)}</p>}
        {o.compensation_type !== 'voluntary' && o.compensation_details && <p className="text-ink-500">{o.compensation_details}</p>}
      </div>
    </Card>
  )
}

export function OrgCardView({ o }: { o: OrgCard }) {
  return (
    <Card className="flex h-full gap-3">
      <OrgLogo name={o.name} url={o.logo_url} />
      <div className="min-w-0">
        <h3 className="font-semibold leading-snug"><Link className="hover:underline" to={`/organizations/${o.slug}`}>{o.name}</Link></h3>
        <p className="text-sm text-ink-500">{ORG_TYPE_LABELS[o.org_type]} · {CAUSE_LABELS[o.cause]}</p>
        <p className="text-sm text-ink-500">{o.city ? `${o.city}, ` : ''}{o.country_code}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={`${pill} bg-emerald-50 text-emerald-900`}>✓ Verified</span>
          <span className={`${pill} bg-slate-100 text-slate-800`}>{o.published_opportunities} open opportunit{o.published_opportunities === 1 ? 'y' : 'ies'}</span>
          {o.review_count > 0 && <span className={`${pill} bg-amber-50 text-amber-900`}>★ {o.average_rating} ({o.review_count})</span>}
        </div>
      </div>
    </Card>
  )
}

export function OrgLogo({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-md border border-black/10 object-cover" style={{ width: size, height: size }} />
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-md bg-brand-50 font-semibold text-brand-800" style={{ width: size, height: size }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Card-shaped placeholder while lists load (reduces layout shift). */
export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="h-36 animate-pulse rounded-lg border border-black/5 bg-white/70" />
      ))}
    </ul>
  )
}
