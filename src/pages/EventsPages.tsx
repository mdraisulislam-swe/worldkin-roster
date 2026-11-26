import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { Constants } from '../lib/database.types'
import { CAUSE_LABELS, MODE_LABELS, formatShiftWindow } from '../lib/format'
import { COMPENSATION_LABELS, COMPENSATION_TYPES } from '../lib/platform'
import { getShiftAvailability } from '../lib/api'
import { eventTitle, getEvent, getRecentEvents, getUpcomingEvents, splitByTime, type PublicEvent } from '../lib/events'
import { groupByDay } from '../lib/dashboard'
import { downloadIcs } from '../lib/calendar'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CompensationBadge, OrgLogo } from '../components/cards'
import { Button, CapacityMeter, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select } from '../components/ui'
import { Icon } from '../components/Icon'

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

function place(e: PublicEvent) {
  const o = e.opportunities!
  if (o.mode === 'remote') return 'Remote'
  return [o.city, o.country_code].filter(Boolean).join(', ') || MODE_LABELS[o.mode]
}


/** Prototype "eventRow": date tile (LIVE NOW while running), title, organizer · place · time, pay badge, chevron. */
function EventRow({ e, live = false }: { e: PublicEvent; live?: boolean }) {
  const o = e.opportunities!
  const org = o.organizations
  return (
    <li>
      <Link to={`/events/${e.id}`} className="flex items-center gap-4 rounded-xl border border-neutral-100 bg-white p-4 shadow-[0_1px_2px_rgba(20,26,34,0.04)] transition-colors hover:border-brand-600 sm:p-5">
        <span className={`flex min-w-[72px] shrink-0 flex-col items-center rounded-[10px] px-2 py-2 text-center ${live ? 'bg-emerald-50' : 'bg-brand-50'}`}>
          {live
            ? <span className="text-xs font-bold text-emerald-800">LIVE NOW</span>
            : <><span className="text-xs font-semibold uppercase text-brand-700">{dayFmt.format(new Date(e.starts_at))}</span>
                <span className="font-display text-sm font-bold tabular-nums text-ink-900">{timeFmt.format(new Date(e.starts_at))}</span></>}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold text-ink-900">{eventTitle(e)}</span>
          <span className="text-xs text-ink-500">
            {org?.name}{org?.status === 'verified' && <span className="ml-1 inline-flex align-[-2px] text-brand-700" title="Verified by Worldkin"><Icon name="shield-check" size={13} /><span className="sr-only"> verified organization</span></span>}
            {' · '}{place(e)} · {timeFmt.format(new Date(e.starts_at))}–{timeFmt.format(new Date(e.ends_at))}
          </span>
          <span className="text-xs text-ink-500">{CAUSE_LABELS[o.cause]}</span>
        </span>
        <span className="hidden sm:inline-flex"><CompensationBadge type={o.compensation_type} /></span>
        <Icon name="chevron-right" size={18} className="text-ink-500" />
      </Link>
    </li>
  )
}

/** Public events: real scheduled shifts of published opportunities (RLS-filtered). */
export function EventsPage() {
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const upcomingQ = useQuery({ queryKey: ['events', 'upcoming'], queryFn: () => getUpcomingEvents(Date.now()) })
  const recentQ = useQuery({ queryKey: ['events', 'recent'], queryFn: () => getRecentEvents(Date.now()) })
  const cause = params.get('cause') ?? '', mode = params.get('mode') ?? '', comp = params.get('compensation') ?? ''
  const keep = (e: PublicEvent) => !!e.opportunities
    && (!cause || e.opportunities.cause === cause) && (!mode || e.opportunities.mode === mode) && (!comp || e.opportunities.compensation_type === comp)
  const { ongoing, upcoming } = splitByTime((upcomingQ.data ?? []).filter(keep), now)
  const recent = (recentQ.data ?? []).filter(keep)
  const setFilter = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }
  const filtered = !!(cause || mode || comp)

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Events" subtitle="Shifts and activities from verified organizations. Open an event to join or apply." />
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Cause" value={cause} onChange={(e) => setFilter('cause', e.currentTarget.value)}
            options={[{ value: '', label: 'All causes' }, ...Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))]} />
          <Select label="Mode" value={mode} onChange={(e) => setFilter('mode', e.currentTarget.value)}
            options={[{ value: '', label: 'Any' }, ...Constants.public.Enums.opportunity_mode.map((m) => ({ value: m, label: MODE_LABELS[m] }))]} />
          <Select label="Compensation" value={comp} onChange={(e) => setFilter('compensation', e.currentTarget.value)}
            options={[{ value: '', label: 'Any' }, ...COMPENSATION_TYPES.map((c) => ({ value: c, label: COMPENSATION_LABELS[c] }))]} />
        </div>
        {filtered && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>}
      </Card>

      {upcomingQ.isPending && <LoadingState label="Loading events" />}
      {upcomingQ.isError && <ErrorState message={toAppError(upcomingQ.error).message} onRetry={() => upcomingQ.refetch()} />}

      {ongoing.length > 0 && (
        <section aria-labelledby="ongoing-h">
          <h2 id="ongoing-h" className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span aria-hidden className="h-2 w-2 rounded-full bg-natural-500" />Happening now
          </h2>
          <ul className="flex flex-col gap-3">{ongoing.map((e) => <EventRow key={e.id} e={e} live />)}</ul>
        </section>
      )}

      {upcomingQ.data && (
        <section aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" className="mb-4 text-xl font-semibold">Upcoming <span className="text-sm font-normal text-ink-500">· next 60 days</span></h2>
          {upcoming.length === 0 ? (
            <EmptyState title={filtered ? 'No upcoming events match these filters' : 'No upcoming events yet'}>
              {filtered ? 'Try clearing a filter.' : <>New events appear here as verified organizations schedule them. <Link className="text-brand-700 underline" to="/explore">Explore opportunities</Link></>}
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {groupByDay(upcoming, (e) => e.starts_at, now).map((day) => (
                <div key={day.key}>
                  <h3 className="mb-2 text-sm font-semibold text-ink-700">{day.label}</h3>
                  <ul className="flex flex-col gap-3">{day.items.map((e) => <EventRow key={e.id} e={e} />)}</ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-1 text-xl font-semibold">Recently held</h2>
          <p className="mb-3 text-sm text-ink-500">Scheduled events from the last 60 days that were not cancelled. Attendance is verified separately by each organization.</p>
          <ul className="flex flex-col gap-3">{recent.map((e) => <EventRow key={e.id} e={e} />)}</ul>
        </section>
      )}
    </div>
  )
}

/** Event detail: one public shift with its organizer, opportunity and the existing join/apply path. */
export function EventDetailPage() {
  const { id = '' } = useParams()
  const now = useNow(60_000)
  const q = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) })
  const oppId = q.data?.opportunity_id
  const avail = useQuery({ queryKey: ['availability', oppId], enabled: !!oppId, queryFn: () => getShiftAvailability(oppId!) })
  const more = useQuery({
    queryKey: ['events', 'org', q.data?.opportunities?.org_id], enabled: !!q.data?.opportunities?.org_id,
    queryFn: () => getUpcomingEvents(Date.now(), { orgId: q.data!.opportunities!.org_id, limit: 6 }),
  })

  if (q.isPending) return <LoadingState label="Loading event" />
  if (q.isError) return <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />
  if (!q.data) {
    return <><PageHeader title="Event not available" /><EmptyState title="This event can't be shown">It may have been cancelled, or its listing is no longer public. <Link className="text-brand-700 underline" to="/events">See all events</Link></EmptyState></>
  }
  const e = q.data, o = e.opportunities!, org = o.organizations
  const ended = new Date(e.ends_at).getTime() <= now
  const seat = avail.data?.find((s) => s.shift_id === e.id)
  const others = (more.data ?? []).filter((x) => x.id !== e.id).slice(0, 4)

  return (
    <>
      <p className="mb-2 text-sm"><Link className="text-brand-700 underline" to="/events">← All events</Link></p>
      <PageHeader title={eventTitle(e)} subtitle={<>{formatShiftWindow(e.starts_at, e.ends_at)} · {place(e)}</>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <CompensationBadge type={o.compensation_type} />
              <span className="text-sm text-ink-500">{CAUSE_LABELS[o.cause]} · {MODE_LABELS[o.mode]}</span>
            </div>
            <h2 className="mt-3 font-semibold">{o.title}</h2>
            <p className="mt-1 line-clamp-6 whitespace-pre-line text-ink-700">{o.description}</p>
            <Link className="mt-3 inline-block text-sm text-brand-700 underline" to={`/opportunities/${o.id}`}>Full opportunity details</Link>
          </Card>
        </div>
        <aside className="flex flex-col gap-4">
          <Card>
            {ended ? (
              <p className="text-sm text-ink-700">This event has ended. Hours for those who attended are verified by the organization.</p>
            ) : (
              <>
                {seat && <CapacityMeter confirmed={seat.confirmed} capacity={seat.capacity} waitlisted={seat.waitlisted} />}
                <p className="mt-3 text-sm text-ink-700">{o.selection_mode === 'application'
                  ? 'Selection by application: apply on the opportunity page; selected volunteers receive an offer to accept.'
                  : 'Open sign-up: join this shift on the opportunity page while seats are free; otherwise join the waitlist.'}</p>
                <Link to={`/opportunities/${o.id}`} className="mt-3 inline-block rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
                  {o.selection_mode === 'application' ? 'Apply on the opportunity page' : 'Join on the opportunity page'}
                </Link>
                <Button variant="ghost" className="mt-2" onClick={() => downloadIcs({ uid: e.id, title: eventTitle(e), startsAt: e.starts_at, endsAt: e.ends_at, description: `${o.title} · ${org?.name ?? 'Worldkin Roster'}` })}>
                  Add to calendar
                </Button>
              </>
            )}
          </Card>
          {org && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Organizer</h2>
              <Link to={`/organizations/${org.slug}`} className="flex items-center gap-3 hover:underline">
                <OrgLogo name={org.name} url={org.logo_url} size={40} />
                <span className="font-medium">{org.name}</span>
              </Link>
              {org.status === 'verified' && <p className="mt-2 text-xs text-emerald-800">✓ Verified by Worldkin before it could publish.</p>}
            </Card>
          )}
        </aside>
      </div>
      {others.length > 0 && (
        <section aria-labelledby="more-h" className="mt-8">
          <h2 id="more-h" className="mb-3 text-lg font-semibold">More from {org?.name ?? 'this organization'}</h2>
          <ul className="flex flex-col gap-3">{others.map((x) => <EventRow key={x.id} e={x} />)}</ul>
        </section>
      )}
    </>
  )
}
