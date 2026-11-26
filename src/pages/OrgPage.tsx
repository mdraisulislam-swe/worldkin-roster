import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { getOrgDashboard, getOrgOpportunities, getOrganization } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, MODE_LABELS } from '../lib/format'
import { Alert, CapacityMeter, Card, EmptyState, ErrorState, LoadingState, PageHeader, Stat, StatusBadge, Tabs } from '../components/ui'
import { TABLE } from '../lib/table'
import { getOrgApplications, getOrgFeedback } from '../lib/platform'
import { groupByDay } from '../lib/dashboard'
import { Icon } from '../components/Icon'

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/** Organization dashboard (M05 aggregates) + opportunity list for staff. */
export function OrgPage() {
  const { orgId = '' } = useParams()
  const { roleIn, memberships } = useAuth()
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
  // Prototype D02 tabs; declared before the early returns below (hooks order).
  const [oppTab, setOppTab] = useState<'all' | 'published' | 'draft' | 'closed'>('all')

  if (org.isPending) return <LoadingState />
  if (org.isError) {
    const err = toAppError(org.error)
    if (err.code === 'NOT_FOUND') return (
      <>
        <PageHeader title="Organization not available" />
        <EmptyState title="This organization can't be shown">It may not exist, or you may not have access to it. <Link className="text-brand-700 underline" to="/orgs">Your organizations</Link></EmptyState>
      </>
    )
    return <ErrorState message={err.message} onRetry={() => org.refetch()} />
  }
  const o = org.data
  const primaryBtn = 'inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-[15px] font-semibold text-white hover:bg-brand-800'
  const secondaryBtn = 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-100 bg-white px-4 text-[15px] font-semibold text-ink-900 hover:border-brand-600'
  const toReview = newCount == null || reviewCount == null ? null : newCount + reviewCount
  // Next scheduled shifts across this organization's opportunities (already loaded; no extra query).
  const nextShifts = (opps.data ?? [])
    .flatMap((op) => op.shifts.filter((sh) => sh.status === 'scheduled' && new Date(sh.starts_at).getTime() > now).map((sh) => ({ ...sh, title: op.title })))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 8)

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader
        title={o.name}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">
          {o.status === 'verified'
            ? <span className="inline-flex items-center gap-1 font-semibold text-brand-700"><Icon name="shield-check" size={16} />Verified</span>
            : <StatusBadge status={o.status} />}
          <span>{CAUSE_LABELS[o.cause]} · {o.country_code}</span>
        </span>}
        actions={
          <>
            {o.status === 'verified' && <Link to={`/org/${orgId}/opportunities/new`} className={primaryBtn}><Icon name="briefcase" size={18} />New opportunity</Link>}
            {o.status === 'verified' && <Link to={`/organizations/${o.slug}`} className={secondaryBtn}><Icon name="external-link" size={18} />Public page</Link>}
            {memberships.length > 1 && <Link to="/orgs" className={secondaryBtn}><Icon name="arrow-left-right" size={18} />Switch</Link>}
          </>
        }
      />
      {o.status === 'pending' && <div><Alert tone="warning">Awaiting verification by a Worldkin administrator. You can prepare drafts, but publishing unlocks after verification.{isAdmin && <> <Link className="underline" to={`/org/${orgId}/settings`}>Complete your details and upload verification documents</Link>.</>}</Alert></div>}
      {(o.status === 'suspended' || o.status === 'rejected') && (
        <div><Alert tone="error">This organization is {o.status}{o.status_reason ? `: ${o.status_reason}` : ''}. Public listings and new sign-ups are disabled.</Alert></div>
      )}

      {/* Prototype row: four stat tiles (live values: org_dashboard + applicant counts) */}
      <section aria-labelledby="dash-h">
        <h2 id="dash-h" className="sr-only">Overview</h2>
        {dash.isError && <ErrorState message={toAppError(dash.error).message} onRetry={() => dash.refetch()} />}
        {dash.isPending && <LoadingState label="Loading overview" />}
        {dash.data && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon="briefcase" label="Active opportunities" value={dash.data.opportunities.published} caption={`${dash.data.opportunities.draft} draft${dash.data.opportunities.draft === 1 ? '' : 's'} · ${dash.data.opportunities.closed} closed`} />
            <Stat icon="users" label="Applicants to review" value={toReview ?? '…'} caption={newCount != null ? `${newCount} new` : undefined} />
            <Stat icon="calendar" label="Upcoming shifts" value={dash.data.upcoming_shifts} caption="scheduled" />
            <Stat icon="check-circle" label="Confirmed volunteers" value={`${dash.data.upcoming_confirmed} / ${dash.data.upcoming_capacity}`} caption={`${dash.data.upcoming_waitlisted} waitlisted`} />
          </div>
        )}
      </section>

      {/* Prototype row: Coming up (2/3) + Applicants to review and performance (1/3) */}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-3 sm:p-7">
          <div className="flex items-end justify-between gap-3">
            <h2 id="agenda-h" className="text-xl font-semibold">Coming up</h2>
          </div>
          {opps.isPending && <LoadingState label="Loading shifts" />}
          {opps.data && nextShifts.length === 0 && <p className="text-sm text-ink-500">No upcoming shifts scheduled.</p>}
          {groupByDay(nextShifts, (x) => x.starts_at, now).map((day) => (
            <div key={day.key}>
              <h3 className="my-2 text-sm font-semibold text-ink-700">{day.label}</h3>
              <ul className="flex flex-col">
                {day.items.map((sh) => (
                  <li key={sh.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 py-2.5">
                    <span className="min-w-0 text-sm"><span className="font-semibold tabular-nums">{timeOnly.format(new Date(sh.starts_at))}</span> · {sh.title}</span>
                    <Link to={`/org/${orgId}/shifts/${sh.id}`} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">Manage</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {dash.data && (
            <div className="border-t border-neutral-100 pt-3">
              <CapacityMeter confirmed={dash.data.upcoming_confirmed} capacity={dash.data.upcoming_capacity} waitlisted={dash.data.upcoming_waitlisted} />
              <p className="mt-1 text-xs text-ink-500">Seats filled across all upcoming shifts. Waitlisted volunteers are promoted automatically, first come first served.</p>
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 sm:p-7">
            <h2 className="text-xl font-semibold">Applicants to review</h2>
            <dl className="flex gap-6">
              <div><dd className="font-display text-[32px] font-bold leading-[1.1] tabular-nums text-ink-900">{newCount === undefined ? '…' : newCount ?? '—'}</dd><dt className="text-xs text-ink-500">New</dt></div>
              <div><dd className="font-display text-[32px] font-bold leading-[1.1] tabular-nums text-ink-900">{reviewCount === undefined ? '…' : reviewCount ?? '—'}</dd><dt className="text-xs text-ink-500">Under review</dt></div>
            </dl>
            <Link to={`/org/${orgId}/applications`} className="inline-flex min-h-9 items-center self-start rounded-lg bg-brand-700 px-3.5 text-sm font-semibold text-white hover:bg-brand-800">Review applicants</Link>
          </Card>
          {dash.data && (
            <Card className="flex flex-col gap-1">
              <h2 className="mb-1 text-base font-semibold">Performance</h2>
              {([
                ['Verified hours', Number(dash.data.verified_hours).toLocaleString()],
                ['Unique volunteers', dash.data.unique_volunteers],
                ['Fill rate', `${Number(dash.data.fill_rate_pct)}%`],
                ['No-show rate', `${Number(dash.data.no_show_rate_pct)}%`],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-t border-neutral-100 py-2 text-sm"><span className="text-ink-700">{k}</span><span className="font-semibold tabular-nums text-ink-900">{v}</span></div>
              ))}
            </Card>
          )}
        </div>
      </div>

      <section aria-labelledby="opps-h">
        <h2 id="opps-h" className="mb-3 text-xl font-semibold">Opportunities</h2>
        {opps.isPending && <LoadingState />}
        {opps.isError && <ErrorState message={toAppError(opps.error).message} onRetry={() => opps.refetch()} />}
        {opps.data?.length === 0 && <EmptyState title="No opportunities yet">Create the first one to start recruiting volunteers.</EmptyState>}
        {opps.data && opps.data.length > 0 && (() => {
          const all = [...opps.data].sort((x, y) => Number(x.status === 'closed') - Number(y.status === 'closed'))
          const count = (st: string) => all.filter((o) => o.status === st).length
          const shown = all.filter((o) => oppTab === 'all' || o.status === oppTab)
          return (
            <div className="flex flex-col gap-4">
              <Tabs label="Filter opportunities" controls="opps-panel" value={oppTab} onChange={setOppTab}
                tabs={[{ value: 'all', label: 'All', count: all.length }, { value: 'published', label: 'Published', count: count('published') }, { value: 'draft', label: 'Draft', count: count('draft') }, { value: 'closed', label: 'Closed', count: count('closed') }]} />
              <div id="opps-panel" role="tabpanel" aria-labelledby={`tab-opps-panel-${oppTab}`}>
                {shown.length === 0 ? <p className="py-4 text-sm text-ink-500">Nothing in this group.</p> : (
                  <div className={TABLE.wrap}>
                    <table className={TABLE.table}>
                      <caption className="sr-only">Opportunities</caption>
                      <thead className={TABLE.thead}>
                        <tr>
                          <th scope="col" className={TABLE.th}>Opportunity</th>
                          <th scope="col" className={TABLE.th}>Cause · mode</th>
                          <th scope="col" className={TABLE.th}>Upcoming shifts</th>
                          <th scope="col" className={TABLE.th}>Status</th>
                          <th scope="col" className={TABLE.th}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className={TABLE.tbody}>
                        {shown.map((op) => {
                          const upcoming = op.shifts.filter((x) => x.status === 'scheduled' && new Date(x.starts_at).getTime() > now).length
                          return (
                            <tr key={op.id} className={TABLE.tr}>
                              <td className={TABLE.td}>
                                <Link className="font-semibold text-ink-900 hover:text-brand-700 hover:underline" to={`/org/${orgId}/opportunities/${op.id}`}>{op.title}</Link>
                                <p className="text-xs text-ink-500">{op.city ?? MODE_LABELS[op.mode]}{op.is_sensitive ? ' · sensitive' : ''}<span className="md:hidden"> · {upcoming} upcoming shift{upcoming === 1 ? '' : 's'}</span></p>
                              </td>
                              <td className={`${TABLE.td} ${TABLE.hideSm}`}>{CAUSE_LABELS[op.cause]} · {MODE_LABELS[op.mode]}</td>
                              <td className={`${TABLE.td} ${TABLE.hideSm} tabular-nums`}>{upcoming}</td>
                              <td className={TABLE.td}><StatusBadge status={op.status} /></td>
                              <td className={`${TABLE.td} ${TABLE.hideSm} text-right`}>
                                <Link to={`/org/${orgId}/opportunities/${op.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-[#d5d9d2] bg-white px-3 text-sm font-semibold text-ink-900 hover:border-brand-600 hover:text-brand-700">Manage</Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </section>
      <section aria-labelledby="fb-h">
        <h2 id="fb-h" className="mb-3 text-xl font-semibold">Volunteer feedback</h2>
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
    </div>
  )
}
