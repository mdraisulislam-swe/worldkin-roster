import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { CAUSE_LABELS } from '../lib/format'
import { getPlatformStats, listOrganizations, searchOpportunities } from '../lib/platform'
import { useNow } from '../lib/useNow'
import { CardSkeletons, OpportunityCardView, OrgCardView } from '../components/cards'
import { EmptyState } from '../components/ui'

export function HomePage() {
  const { session } = useAuth()
  const now = useNow()
  const stats = useQuery({ queryKey: ['platform-stats'], queryFn: getPlatformStats, staleTime: 60_000 })
  const recent = useQuery({ queryKey: ['home', 'recent'], queryFn: () => searchOpportunities({ sort: 'newest', pageSize: 6 }) })
  const closing = useQuery({ queryKey: ['home', 'closing'], queryFn: () => searchOpportunities({ sort: 'closing', pageSize: 3 }) })
  const orgs = useQuery({ queryKey: ['home', 'orgs'], queryFn: () => listOrganizations({ pageSize: 6 }) })

  return (
    <div className="flex flex-col gap-16 py-4 sm:gap-20 sm:py-10">
      <section aria-labelledby="hero-h" className="border-b border-black/5 pb-14 sm:pb-16">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-700">Global volunteer &amp; opportunity platform</p>
        <h1 id="hero-h" className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">Everyone is kin.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-700 sm:text-xl">
          Worldkin Roster connects volunteers with verified organizations — voluntary, stipend-based and paid roles,
          fair selection, capacity-safe shifts and participation records that cannot be faked.
        </p>
        <div className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
          <Link to={session ? '/explore' : '/signup?as=volunteer'} className="rounded-lg bg-brand-700 p-5 text-white shadow-sm transition-colors hover:bg-brand-800">
            <span className="block font-semibold">{session ? 'Find an opportunity' : 'Join as a volunteer'}</span>
            <span className="text-sm text-white/85">Build a profile, apply, get selected, log verified hours.</span>
          </Link>
          <Link to={session ? '/orgs/new' : '/signup?as=organization'} className="rounded-lg border border-black/15 bg-white p-5 shadow-sm transition-colors hover:border-brand-600">
            <span className="block font-semibold text-ink-900">Register your organization</span>
            <span className="text-sm text-ink-500">Get verified, publish opportunities, select volunteers.</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className="sr-only">Platform in numbers</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['Volunteers', stats.data?.volunteers],
            ['Verified organizations', stats.data?.verified_organizations],
            ['Active opportunities', stats.data?.active_opportunities],
            ['Completed events', stats.data?.completed_events],
            ['Countries', stats.data?.countries],
            ['Cities', stats.data?.cities],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-black/10 bg-white px-4 py-3.5 shadow-sm">
              <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">{stats.isPending ? '…' : stats.isError ? '—' : Number(value ?? 0).toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-500">Live counts from the platform database{stats.data ? ` · ${Number(stats.data.verified_hours).toLocaleString()} verified volunteer hours` : ''}.</p>
      </section>

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
