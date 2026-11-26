import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { getOrgDashboard, getOrgOpportunities, getOrganization } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, MODE_LABELS } from '../lib/format'
import { Alert, CapacityMeter, Card, EmptyState, ErrorState, LoadingState, PageHeader, Stat, StatusBadge } from '../components/ui'
import { DashboardNav } from '../components/DashboardNav'
import { orgNav } from '../lib/nav'
import { getOrgApplications, getOrgFeedback } from '../lib/platform'

/** Organization dashboard (M05 aggregates) + opportunity list for staff. */
export function OrgPage() {
  const { orgId = '' } = useParams()
  const { roleIn } = useAuth()
  const isAdmin = roleIn(orgId) === 'org_admin'
  const now = useNow()
  const org = useQuery({ queryKey: ['org', orgId], queryFn: () => getOrganization(orgId) })
  const dash = useQuery({ queryKey: ['org-dashboard', orgId], queryFn: () => getOrgDashboard(orgId) })
  const opps = useQuery({ queryKey: ['org-opps', orgId], queryFn: () => getOrgOpportunities(orgId) })
  const feedback = useQuery({ queryKey: ['org-feedback', orgId], queryFn: () => getOrgFeedback(orgId, 5) })
  // Server-side counts (total_count) from the existing, RLS-protected applicant RPC; no new query or data.
  const newApps = useQuery({ queryKey: ['org-app-count', orgId, 'submitted'], queryFn: () => getOrgApplications(orgId, undefined, 'submitted') })
  const reviewApps = useQuery({ queryKey: ['org-app-count', orgId, 'under_review'], queryFn: () => getOrgApplications(orgId, undefined, 'under_review') })
  const countOf = (q: typeof newApps) => (q.isError ? null : q.data ? (q.data[0]?.total_count ?? 0) : undefined)
  const newCount = countOf(newApps), reviewCount = countOf(reviewApps)

  if (org.isPending) return <LoadingState />
  if (org.isError) return <ErrorState message={toAppError(org.error).message} onRetry={() => org.refetch()} />
  const o = org.data
  const linkBtn = 'rounded-md border border-black/15 bg-white px-3.5 py-2 text-sm font-medium hover:bg-black/5'

  return (
    <>
      <PageHeader
        title={o.name}
        subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={o.status} /> {CAUSE_LABELS[o.cause]} · {o.country_code}</span>}
        actions={
          <>
            {o.status === 'verified' && <Link to={`/org/${orgId}/opportunities/new`} className="rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800">New opportunity</Link>}
            {o.status === 'verified' && <Link to={`/organizations/${o.slug}`} className={linkBtn}>Public page</Link>}
          </>
        }
      />
      <DashboardNav label="Organization dashboard" items={orgNav(orgId, isAdmin)} />
      {o.status === 'pending' && <div className="mb-6"><Alert tone="warning">Awaiting verification by a Worldkin administrator. You can prepare drafts, but publishing unlocks after verification.{isAdmin && <> <Link className="underline" to={`/org/${orgId}/settings`}>Complete your details and upload verification documents</Link>.</>}</Alert></div>}
      {(o.status === 'suspended' || o.status === 'rejected') && (
        <div className="mb-6"><Alert tone="error">This organization is {o.status}{o.status_reason ? `: ${o.status_reason}` : ''}. Public listings and new sign-ups are disabled.</Alert></div>
      )}

      <section aria-labelledby="dash-h" className="mb-8">
        <h2 id="dash-h" className="mb-3 text-lg font-semibold">Overview</h2>
        {dash.isError && <ErrorState message={toAppError(dash.error).message} onRetry={() => dash.refetch()} />}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Applicants to review</h3>
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-ink-500">New</dt><dd className="text-2xl font-semibold text-ink-900">{newCount === undefined ? '…' : newCount ?? '—'}</dd></div>
              <div><dt className="text-xs text-ink-500">Under review</dt><dd className="text-2xl font-semibold text-ink-900">{reviewCount === undefined ? '…' : reviewCount ?? '—'}</dd></div>
            </dl>
            <Link to={`/org/${orgId}/applications`} className="mt-auto self-start rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">Review applicants</Link>
          </Card>
          {dash.data && (
            <Card className="flex flex-col gap-3 lg:col-span-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Upcoming shifts</h3>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <p className="text-ink-700"><span className="text-2xl font-semibold text-ink-900">{dash.data.upcoming_shifts}</span> scheduled · {dash.data.upcoming_waitlisted} on waitlists</p>
                <div className="w-full sm:w-64"><CapacityMeter confirmed={dash.data.upcoming_confirmed} capacity={dash.data.upcoming_capacity} /></div>
              </div>
              <p className="text-xs text-ink-500">Seats filled across all upcoming shifts. Waitlisted volunteers are promoted automatically, first come first served.</p>
            </Card>
          )}
        </div>
        {dash.data && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Opportunities" value={`${dash.data.opportunities.published} live · ${dash.data.opportunities.draft} draft`} />
            <Stat label="Verified hours" value={Number(dash.data.verified_hours)} />
            <Stat label="Unique volunteers" value={dash.data.unique_volunteers} />
            <Stat label="Fill rate" value={`${Number(dash.data.fill_rate_pct)}%`} />
            <Stat label="No-show rate" value={`${Number(dash.data.no_show_rate_pct)}%`} />
          </div>
        )}
      </section>

      <section aria-labelledby="opps-h">
        <h2 id="opps-h" className="mb-3 text-lg font-semibold">Opportunities</h2>
        {opps.isPending && <LoadingState />}
        {opps.isError && <ErrorState message={toAppError(opps.error).message} onRetry={() => opps.refetch()} />}
        {opps.data?.length === 0 && <EmptyState title="No opportunities yet">Create the first one to start recruiting volunteers.</EmptyState>}
        <ul className="flex flex-col gap-2">
          {[...(opps.data ?? [])].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed')).map((op) => {
            const upcoming = op.shifts.filter((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() > now).length
            return (
              <li key={op.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link className="font-medium hover:underline" to={`/org/${orgId}/opportunities/${op.id}`}>{op.title}</Link>
                    <p className="text-sm text-ink-500">{CAUSE_LABELS[op.cause]} · {MODE_LABELS[op.mode]}{op.city ? ` · ${op.city}` : ''} · {upcoming} upcoming shift{upcoming === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {op.is_sensitive && <span className="text-xs text-amber-800">sensitive</span>}
                    <StatusBadge status={op.status} />
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      </section>
      <section aria-labelledby="fb-h" className="mt-8">
        <h2 id="fb-h" className="mb-3 text-lg font-semibold">Volunteer feedback</h2>
        {feedback.isPending ? <LoadingState label="Loading feedback" /> : feedback.data && feedback.data.length > 0 ? (
          <>
            <p className="mb-2 text-sm text-ink-700">Average ★ {feedback.data[0].average_rating} from {feedback.data[0].total_count} verified participant{feedback.data[0].total_count === 1 ? '' : 's'}.</p>
            <ul className="flex flex-col gap-2">
              {feedback.data.map((f) => (
                <li key={f.feedback_id}><Card><p aria-label={`${f.rating} out of 5`}>{'★'.repeat(f.rating)}</p>{f.comment && <p className="text-sm text-ink-700">{f.comment}</p>}<p className="text-xs text-ink-500">{f.reviewer_first_name} · {f.opportunity_title}</p></Card></li>
              ))}
            </ul>
          </>
        ) : <EmptyState title="No feedback yet">Volunteers can leave feedback after you verify their attendance.</EmptyState>}
      </section>
    </>
  )
}
