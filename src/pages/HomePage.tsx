import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { CAUSE_LABELS } from '../lib/format'
import { getPlatformStats, listOrganizations, searchOpportunities } from '../lib/platform'
import { useNow } from '../lib/useNow'
import { CardSkeletons, OpportunityCardView, OrgCardView } from '../components/cards'
import { EmptyState } from '../components/ui'
import { eventTitle, getUpcomingEvents } from '../lib/events'

const evDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function HomePage() {
  const { session } = useAuth()
  const now = useNow()
  const stats = useQuery({ queryKey: ['platform-stats'], queryFn: getPlatformStats, staleTime: 60_000 })
  const recent = useQuery({ queryKey: ['home', 'recent'], queryFn: () => searchOpportunities({ sort: 'newest', pageSize: 6 }) })
  const closing = useQuery({ queryKey: ['home', 'closing'], queryFn: () => searchOpportunities({ sort: 'closing', pageSize: 3 }) })
  const orgs = useQuery({ queryKey: ['home', 'orgs'], queryFn: () => listOrganizations({ pageSize: 6 }) })
  const events = useQuery({ queryKey: ['home', 'events'], queryFn: () => getUpcomingEvents(Date.now(), { days: 30, limit: 4 }) })

  return (
    <div className="flex flex-col gap-16 py-4 sm:gap-20 sm:py-10">
      <section aria-labelledby="hero-h" className="overflow-hidden rounded-[28px] bg-forest-900 text-white lg:grid lg:min-h-[540px] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-center gap-6 px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-200">Volunteering · internships · community programmes</p>
          <h1 id="hero-h" className="text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Everyone is kin.</h1>
          <p className="max-w-xl text-lg leading-relaxed text-sage-200">
            Find meaningful opportunities with verified organizations — voluntary, stipend-based and paid — take part, and build a
            record of experience the organization itself confirms.
          </p>
          <HeroSearch />
          <div className="flex flex-wrap gap-3">
            <Link to={session ? '/explore' : '/signup?as=volunteer'} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-[15px] font-semibold text-forest-900 hover:bg-brand-50">
              <Icon name="user" size={18} />{session ? 'Find an opportunity' : 'Join as a volunteer'}
            </Link>
            <Link to={session ? '/orgs/new' : '/signup?as=organization'} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/35 px-4 text-[15px] font-semibold text-white hover:bg-white/10">
              <Icon name="building" size={18} />Register an organization
            </Link>
          </div>
        </div>
        <div className="relative min-h-64 bg-brand-800 lg:min-h-0">
          {/* Decorative community photo (Unsplash, free licence); hidden if it cannot load. */}
          <img src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?auto=format&fit=crop&w=1200&q=70" alt=""
            loading="eager" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow">
            <Icon name="shield-check" size={15} />Every organization is verified
          </span>
        </div>
      </section>

      <section aria-labelledby="stats-h">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="stats-h" className="text-2xl font-bold tracking-tight">Impact so far</h2>
          <p className="text-xs text-ink-500">Live counts from the platform database{stats.data ? ` · ${Number(stats.data.verified_hours).toLocaleString()} verified volunteer hours` : ''}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['Volunteers', stats.data?.volunteers, 'users', 'registered'],
            ['Verified organizations', stats.data?.verified_organizations, 'shield-check', 'reviewed before publishing'],
            ['Active opportunities', stats.data?.active_opportunities, 'briefcase', 'open now'],
            ['Completed events', stats.data?.completed_events, 'check-circle', 'finished shifts'],
            ['Countries', stats.data?.countries, 'globe', 'with listings'],
            ['Cities', stats.data?.cities, 'map-pin', 'with listings'],
          ] as const).map(([label, value, icon, caption]) => (
            <div key={label} className="flex flex-col rounded-xl border border-neutral-100 bg-white p-4 shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
              <dt className="flex items-center gap-2 text-[13px] font-medium text-ink-700"><Icon name={icon} size={16} className="text-brand-700" />{label}</dt>
              <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-ink-900">{stats.isPending ? '…' : stats.isError ? '—' : Number(value ?? 0).toLocaleString()}</dd>
              <dd className="text-xs text-ink-500">{caption}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Each statement below is enforced by the database (verification gate, row-locked seats, organization-confirmed attendance). */}
      <section aria-labelledby="why-h">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Why Worldkin</p>
        <h2 id="why-h" className="mt-1 text-2xl font-bold tracking-tight">A connected journey, not just a listings board</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {([
            ['shield-check', 'Verified organizations', 'Every organization is reviewed before it can publish, and its trust record is public.'],
            ['users', 'Fair, capacity-safe selection', 'Seats can never be overbooked; waitlists are first-come and transparent.'],
            ['award', 'Experience you can prove', 'Hours are confirmed by organization staff — never self-reported — and collect in your passport.'],
          ] as const).map(([icon, title, text]) => (
            <div key={title} className="rounded-xl border border-neutral-100 bg-white p-6 shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon name={icon} /></span>
              <h3 className="mt-4 text-lg font-bold text-ink-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {events.data && events.data.length > 0 && (
        <section aria-labelledby="events-h">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="events-h" className="text-2xl font-semibold tracking-tight">Upcoming events</h2>
            <Link to="/events" className="text-sm text-brand-700 underline">All events</Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {events.data.map((e) => (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-sm hover:border-brand-600">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">{evDate.format(new Date(e.starts_at))}</span>
                  <span className="mt-1 font-semibold text-ink-900">{eventTitle(e)}</span>
                  <span className="mt-auto pt-2 text-sm text-ink-500">{e.opportunities?.organizations?.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Listing id="closing" title="Closing soon" more="/explore?sort=closing" q={closing} now={now} empty="Nothing closing soon." />
      <Listing id="recent" title="Recently published" more="/explore?sort=newest" q={recent} now={now} empty="No opportunities published yet." />

      <section aria-labelledby="orgs-h">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="orgs-h" className="text-2xl font-semibold tracking-tight">Verified organizations</h2>
          <Link to="/organizations" className="text-sm text-brand-700 underline">All organizations</Link>
        </div>
        {orgs.isPending ? <CardSkeletons /> : orgs.isError ? <EmptyState title="Organizations could not be loaded" /> : orgs.data.rows.length === 0 ? (
          <EmptyState title="No verified organizations yet" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{orgs.data.rows.map((o) => <li key={o.id}><OrgCardView o={o} /></li>)}</ul>
        )}
      </section>

      <section aria-labelledby="browse-h">
        <h2 id="browse-h" className="text-2xl font-semibold tracking-tight">Browse by cause</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {FEATURED_CAUSES.map((c) => (
            <li key={c}>
              <Link to={`/explore?cause=${c}`} className="inline-block rounded-full border border-black/15 bg-white px-3.5 py-1.5 text-sm hover:border-brand-600 hover:text-brand-800">{CAUSE_LABELS[c]}</Link>
            </li>
          ))}
          <li><Link to="/explore?mode=remote" className="inline-block rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100">Remote only</Link></li>
        </ul>
      </section>

      <section aria-labelledby="how-h" className="grid gap-8 rounded-xl border border-black/10 bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-2">
        <div>
          <h2 id="how-h" className="text-2xl font-semibold tracking-tight">From first search to verified experience</h2>
          <p className="mt-2 text-ink-700">One profile for volunteering, stipend-based and paid roles. Every hour on your record is confirmed by the organization — never self-reported.</p>
          <ol className="mt-4 flex flex-col gap-3">
            {VOLUNTEER_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
                <span><strong>{s.title}.</strong> <span className="text-ink-700">{s.text}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg bg-brand-50 p-6">
          <h2 className="text-2xl font-semibold tracking-tight">For organizations</h2>
          <p className="mt-2 text-ink-700">
            Register and upload verification documents. Once verified, publish voluntary, stipend-based or paid opportunities,
            review applicants, send time-limited offers, manage shifts and confirm attendance.
          </p>
          <Link to={session ? '/orgs/new' : '/signup?as=organization'} className="mt-4 inline-block rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            Register your organization
          </Link>
        </div>
      </section>
    </div>
  )
}

function Listing({ id, title, more, q, now, empty }: {
  id: string; title: string; more: string; now: number; empty: string
  q: { isPending: boolean; isError: boolean; data?: Awaited<ReturnType<typeof searchOpportunities>> }
}) {
  return (
    <section aria-labelledby={`${id}-h`}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 id={`${id}-h`} className="text-2xl font-semibold tracking-tight">{title}</h2>
        <Link to={more} className="text-sm text-brand-700 underline">See all</Link>
      </div>
      {q.isPending ? <CardSkeletons /> : q.isError || !q.data ? <EmptyState title="Opportunities could not be loaded" /> : q.data.rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{q.data.rows.map((o) => <li key={o.id}><OpportunityCardView o={o} now={now} /></li>)}</ul>
      )}
    </section>
  )
}

const FEATURED_CAUSES = ['food_security', 'disaster_response', 'refugee_support', 'education', 'health', 'climate', 'environment', 'community_development'] as const

const VOLUNTEER_STEPS = [
  { title: 'Discover', text: 'Search verified organizations by cause, place, skill or compensation type — paid, stipend and voluntary roles are always labelled.' },
  { title: 'Apply', text: 'Join open shifts instantly, or apply with your profile where the organization selects volunteers.' },
  { title: 'Get selected', text: 'Selected applicants receive an offer to accept within 72 hours; seats are capacity-safe with a fair waitlist.' },
  { title: 'Participate', text: 'See your agenda, add shifts to your calendar and get updates in one place.' },
  { title: 'Get verified', text: 'Organization staff confirm attendance and hours. You cannot record your own hours.' },
  { title: 'Build your passport', text: 'Verified experience and certificates collect in a printable experience passport.' },
]

/** Hero search: hands the words and place to Explore's existing filters (q, city). */
function HeroSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState(''), [place, setPlace] = useState('')
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (place.trim()) p.set('city', place.trim())
    navigate('/explore' + (p.size ? '?' + p.toString() : ''))
  }
  return (
    <form role="search" onSubmit={onSubmit} className="flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg sm:flex-row">
      <label className="flex flex-1 items-center gap-2 px-3 text-ink-500"><Icon name="search" size={18} /><span className="sr-only">What do you want to do?</span>
        <input aria-label="What would you like to do?" value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Teaching, food relief, climate…" className="min-h-11 w-full bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-500/70" /></label>
      <label className="flex flex-1 items-center gap-2 border-black/5 px-3 text-ink-500 sm:border-l"><Icon name="map-pin" size={18} /><span className="sr-only">City</span>
        <input aria-label="City" value={place} onChange={(e) => setPlace(e.currentTarget.value)} placeholder="City" className="min-h-11 w-full bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-500/70" /></label>
      <button className="min-h-11 rounded-lg bg-brand-700 px-5 text-[15px] font-semibold text-white hover:bg-brand-800">Find opportunities</button>
    </form>
  )
}
