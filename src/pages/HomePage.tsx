import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { CAUSE_LABELS } from '../lib/format'

export function HomePage() {
  const { session } = useAuth()
  return (
    <section className="py-10 sm:py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Global volunteer mobilization</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">Everyone is kin.</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-700">
        Worldkin Roster connects people who want to help with verified organizations and communities that need
        volunteers — with fair, capacity-safe shift sign-ups and participation records that cannot be faked.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/explore" className="rounded-md bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800">Find an opportunity</Link>
        {session ? (
          <Link to="/orgs/new" className="rounded-md border border-black/15 bg-white px-4 py-2.5 font-medium hover:bg-black/5">Register your organization</Link>
        ) : (
          <Link to="/signup" className="rounded-md border border-black/15 bg-white px-4 py-2.5 font-medium hover:bg-black/5">Create an account</Link>
        )}
      </div>
      <dl className="mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
        <div><dt className="font-semibold">Verified organizations</dt><dd className="mt-1 text-sm text-ink-500">Every organization is reviewed before it can recruit.</dd></div>
        <div><dt className="font-semibold">Fair, safe sign-ups</dt><dd className="mt-1 text-sm text-ink-500">Hard capacity limits, first-come waitlists and no double booking.</dd></div>
        <div><dt className="font-semibold">Hours you can trust</dt><dd className="mt-1 text-sm text-ink-500">Participation is verified by the organization, never self-reported.</dd></div>
      </dl>

      <section aria-labelledby="browse-h" className="mt-14">
        <h2 id="browse-h" className="text-xl font-semibold">Browse by cause</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {FEATURED_CAUSES.map((c) => (
            <li key={c}>
              <Link to={`/explore?cause=${c}`} className="inline-block rounded-full border border-black/15 bg-white px-3.5 py-1.5 text-sm hover:border-brand-600 hover:text-brand-800">
                {CAUSE_LABELS[c]}
              </Link>
            </li>
          ))}
          <li><Link to="/explore?mode=remote" className="inline-block rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100">Remote only</Link></li>
        </ul>
      </section>

      <section aria-labelledby="how-h" className="mt-14 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 id="how-h" className="text-xl font-semibold">How it works for volunteers</h2>
          <ol className="mt-4 flex flex-col gap-3">
            {VOLUNTEER_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
                <span><strong>{s.title}.</strong> <span className="text-ink-700">{s.text}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-5">
          <h2 className="text-xl font-semibold">For organizations</h2>
          <p className="mt-2 text-ink-700">
            Register your organization, get verified, publish opportunities with shifts and capacity, invite coordinators,
            and confirm attendance — verified hours build trust with volunteers.
          </p>
          <Link to={session ? '/orgs/new' : '/signup'} className="mt-4 inline-block rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            {session ? 'Register your organization' : 'Create an account to start'}
          </Link>
        </div>
      </section>
    </section>
  )
}

const FEATURED_CAUSES = ['food_security', 'disaster_response', 'refugee_support', 'education', 'health', 'climate', 'environment', 'community_development'] as const

const VOLUNTEER_STEPS = [
  { title: 'Find', text: 'Search by cause, place or remote, and see open spots and next dates at a glance.' },
  { title: 'Join a shift', text: 'Get a confirmed place instantly, or a fair spot on the waitlist that promotes you automatically.' },
  { title: 'Show up', text: 'Add the shift to your calendar; cancel early if plans change so someone else can go.' },
  { title: 'Get verified', text: 'The organization confirms your hours — download your verified volunteer record anytime.' },
]
