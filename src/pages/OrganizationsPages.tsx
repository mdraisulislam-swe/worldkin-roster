import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { Constants, type Enums } from '../lib/database.types'
import { CAUSE_LABELS, formatDateTime } from '../lib/format'
import { ORG_TYPES, ORG_TYPE_LABELS, getOrgFeedback, getOrganizationBySlug, listOrganizations, searchOpportunities, type OrgType } from '../lib/platform'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CardSkeletons, OpportunityCardView, OrgCardView, OrgLogo } from '../components/cards'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select, StatusBadge, TextField } from '../components/ui'

/** Public directory of verified organizations. */
export function OrganizationsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const filters = {
    query: params.get('q') ?? '',
    country: params.get('country') ?? '',
    cause: (params.get('cause') || undefined) as Enums<'cause_category'> | undefined,
    orgType: (params.get('type') || undefined) as OrgType | undefined,
    page,
  }
  const q = useQuery({ queryKey: ['orgs', filters], queryFn: () => listOrganizations(filters) })
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1

  return (
    <>
      <PageHeader title="Organizations" subtitle="Every organization listed here was reviewed and verified by Worldkin administrators." />
      <Card className="mb-6">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="search" onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget); const n = new URLSearchParams()
          for (const k of ['q', 'country', 'cause', 'type']) { const v = String(f.get(k) ?? '').trim(); if (v) n.set(k, k === 'country' ? v.toUpperCase() : v) }
          setParams(n)
        }}>
          <div className="sm:col-span-2"><TextField label="Search" name="q" defaultValue={filters.query} placeholder="Name or mission" /></div>
          <Select label="Cause" name="cause" defaultValue={filters.cause ?? ''} options={[{ value: '', label: 'All causes' }, ...Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))]} />
          <Select label="Type" name="type" defaultValue={filters.orgType ?? ''} options={[{ value: '', label: 'All types' }, ...ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABELS[t] }))]} />
          <TextField label="Country" name="country" defaultValue={filters.country} maxLength={2} placeholder="BD" />
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit">Search</Button></div>
        </form>
      </Card>
      {q.isPending && <CardSkeletons count={6} />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="No organizations match">Try another search or country.</EmptyState>}
      {q.data && q.data.rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-500" aria-live="polite">{q.data.total} organization{q.data.total === 1 ? '' : 's'}</p>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{q.data.rows.map((o) => <li key={o.id}><OrgCardView o={o} /></li>)}</ul>
          <nav aria-label="Pagination" className="mt-6 flex items-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => { params.set('page', String(page - 1)); setParams(params) }}>Previous</Button>
            <span className="text-sm text-ink-500">Page {page} of {totalPages}</span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => { params.set('page', String(page + 1)); setParams(params) }}>Next</Button>
          </nav>
        </>
      )}
    </>
  )
}

/** Public organization profile: details, verification, published opportunities and participant feedback. */
export function OrganizationProfilePage() {
  const { slug = '' } = useParams()
  const now = useNow()
  const org = useQuery({ queryKey: ['org-public', slug], queryFn: () => getOrganizationBySlug(slug) })
  const orgId = org.data?.id
  const opps = useQuery({
    queryKey: ['org-public-opps', orgId], enabled: !!orgId,
    queryFn: async () => (await searchOpportunities({ orgId, pageSize: 50, sort: 'newest' })).rows,
  })
  const fb = useQuery({ queryKey: ['org-feedback', orgId], enabled: !!orgId, queryFn: () => getOrgFeedback(orgId!) })

  if (org.isPending) return <LoadingState />
  if (org.isError) return <ErrorState message={toAppError(org.error).message} onRetry={() => org.refetch()} />
  const o = org.data
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <OrgLogo name={o.name} url={o.logo_url} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-ink-900">{o.name}</h1>
          <p className="mt-1 text-sm text-ink-500">{ORG_TYPE_LABELS[o.org_type]} · {CAUSE_LABELS[o.cause]} · {o.city ? `${o.city}, ` : ''}{o.country_code}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {o.status === 'verified' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">✓ Verified by Worldkin</span> : <StatusBadge status={o.status} />}
            {fb.data?.[0] && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">★ {fb.data[0].average_rating} from {fb.data[0].total_count} volunteer review{fb.data[0].total_count === 1 ? '' : 's'}</span>}
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {o.description && <Card><h2 className="mb-2 font-semibold">About</h2><p className="whitespace-pre-line text-ink-700">{o.description}</p></Card>}
          <section aria-labelledby="opps-h">
            <h2 id="opps-h" className="mb-3 text-lg font-semibold">Open opportunities</h2>
            {opps.isPending ? <CardSkeletons count={2} /> : opps.data && opps.data.length > 0 ? (
              <ul className="grid gap-4 md:grid-cols-2">{opps.data.map((x) => <li key={x.id}><OpportunityCardView o={x} now={now} /></li>)}</ul>
            ) : <EmptyState title="No open opportunities right now" />}
          </section>
          <section aria-labelledby="fb-h">
            <h2 id="fb-h" className="mb-3 text-lg font-semibold">Volunteer feedback</h2>
            <p className="mb-3 text-sm text-ink-500">Only volunteers whose participation was verified can leave feedback.</p>
            {fb.isPending ? <LoadingState label="Loading feedback" /> : fb.data && fb.data.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {fb.data.map((f) => (
                  <li key={f.feedback_id}><Card>
                    <p className="font-medium" aria-label={`${f.rating} out of 5`}>{'★'.repeat(f.rating)}<span className="text-ink-500">{'★'.repeat(5 - f.rating)}</span></p>
                    {f.comment && <p className="mt-1 text-ink-700">{f.comment}</p>}
                    <p className="mt-1 text-xs text-ink-500">{f.reviewer_first_name} · {f.opportunity_title} · {formatDateTime(f.created_at)}</p>
                  </Card></li>
                ))}
              </ul>
            ) : <EmptyState title="No feedback yet" />}
          </section>
        </div>
        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Contact</h2>
            <dl className="flex flex-col gap-1 text-sm">
              {o.website && <div><dt className="sr-only">Website</dt><dd><a className="text-brand-700 underline" href={o.website} target="_blank" rel="noreferrer noopener">Website</a></dd></div>}
              {o.official_email && <div><dt className="inline text-ink-500">Email: </dt><dd className="inline">{o.official_email}</dd></div>}
              {o.phone && <div><dt className="inline text-ink-500">Phone: </dt><dd className="inline">{o.phone}</dd></div>}
              <div><dt className="inline text-ink-500">On Worldkin since: </dt><dd className="inline">{formatDateTime(o.created_at)}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-1 font-semibold">Concern about this organization?</h2>
            <p className="text-sm text-ink-700">Reports go privately to Worldkin administrators, not to the organization.</p>
            <Link className="mt-2 inline-block text-sm text-brand-700 underline" to={`/me/complaints?org=${o.id}`}>Report privately</Link>
          </Card>
        </aside>
      </div>
    </>
  )
}
