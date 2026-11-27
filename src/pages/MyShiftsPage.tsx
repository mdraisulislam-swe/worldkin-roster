import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { acceptInvite, cancelSignup, getMyImpact, getMyInvites, getMySignups } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, formatShiftWindow } from '../lib/format'
import { downloadIcs } from '../lib/calendar'
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Stat, StatusBadge } from '../components/ui'
import { useDialog } from '../components/dialog'
import { getMyApplications, getNotifications } from '../lib/platform'
import { firstName, groupByDay, profileCompletion, summarizeApplications } from '../lib/dashboard'
import { formatDateTime } from '../lib/format'

function NextStep({ text, to, cta, tone }: { text: string; to: string; cta: string; tone?: 'action' }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className={tone === 'action' ? 'text-sm font-medium text-ink-900' : 'text-sm text-ink-700'}>{text}</span>
      <Link to={to} className={tone === 'action'
        ? 'inline-flex min-h-9 shrink-0 items-center rounded-lg bg-brand-700 px-3.5 text-sm font-semibold text-white hover:bg-brand-800'
        : 'inline-flex min-h-9 shrink-0 items-center rounded-lg border border-neutral-100 bg-white px-3.5 text-sm font-semibold text-ink-900 hover:border-brand-600'}>{cta}</Link>
    </li>
  )
}

export function MyShiftsPage() {
  const { session, profile, refresh } = useAuth()
  const uid = session!.user.id
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const signups = useQuery({ queryKey: ['my-signups', uid], queryFn: () => getMySignups(uid) })
  const impact = useQuery({ queryKey: ['my-impact', uid], queryFn: getMyImpact })
  const invites = useQuery({ queryKey: ['my-invites', uid], queryFn: getMyInvites })
  // Same query key as the Applications page, so the data is shared, not fetched twice.
  const apps = useQuery({ queryKey: ['my-applications'], queryFn: getMyApplications })
  // Same key and query as the Notifications page (own rows only, enforced by RLS).
  const notes = useQuery({ queryKey: ['notifications', uid], queryFn: () => getNotifications(uid) })

  const cancel = useMutation({
    mutationFn: (id: string) => cancelSignup(id),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Cancelled.' }); void qc.invalidateQueries({ queryKey: ['my-signups'] }); void qc.invalidateQueries({ queryKey: ['my-impact'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  const accept = useMutation({
    mutationFn: (id: string) => acceptInvite(id),
    onSuccess: async () => { setNotice({ tone: 'success', text: 'Invite accepted — the organization now appears under Organizations.' }); await refresh(); void qc.invalidateQueries({ queryKey: ['my-invites'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })

  const now = useNow()
  const rows = signups.data ?? []
  const upcoming = rows.filter((s) => s.shifts && new Date(s.shifts.ends_at).getTime() > now && s.status !== 'cancelled')
  const past = rows.filter((s) => !upcoming.includes(s))
  const name = firstName(profile?.full_name)
  const completion = profileCompletion(profile as Parameters<typeof profileCompletion>[0])
  const appSummary = apps.data ? summarizeApplications(apps.data, now) : null

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <div className="[&>*:first-child]:mb-0">
      <PageHeader title={name ? `Welcome back, ${name}` : 'Volunteer dashboard'} subtitle="Your applications, offers, shifts and verified hours in one place."
        actions={<Link to="/explore" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-[15px] font-semibold text-white hover:bg-brand-800"><Icon name="search" size={18} />Find opportunities</Link>} />
      <div aria-live="polite" className="[&:not(:empty)]:mt-4">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      </div>

      {/* Prototype row 1: Next steps (2/3) + Profile completion (1/3) */}
      <section className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-labelledby="next-h">
        <Card className="sm:p-7">
          <h2 id="next-h" className="text-xl font-semibold">Next steps</h2>
          <ul className="mt-2 flex flex-col divide-y divide-neutral-100">
            {appSummary && appSummary.offers > 0 && (
              <NextStep tone="action" text={`You have ${appSummary.offers} offer${appSummary.offers === 1 ? '' : 's'} waiting for your answer. Offers expire after 72 hours.`} to="/me/applications" cta="Respond" />
            )}
            {completion.missing.length > 0 && (
              <NextStep text={`Complete your profile (${completion.done}/${completion.total}): add ${completion.missing.slice(0, 3).join(', ').toLowerCase()}${completion.missing.length > 3 ? '…' : ''}.`} to="/me/profile" cta="Edit profile" />
            )}
            {signups.data && upcoming.length === 0 && (
              <NextStep text="You have no upcoming shifts. Browse open opportunities and join or apply." to="/explore" cta="Explore" />
            )}
            {appSummary && appSummary.inProgress > 0 && (
              <NextStep text={`${appSummary.inProgress} application${appSummary.inProgress === 1 ? ' is' : 's are'} being reviewed by organizations.`} to="/me/applications" cta="View" />
            )}
            {appSummary && appSummary.offers === 0 && completion.missing.length === 0 && upcoming.length > 0 && appSummary.inProgress === 0 && (
              <li className="py-3 text-sm text-ink-700">You are all set. See your upcoming shifts below.</li>
            )}
          </ul>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 sm:p-7">
            <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Profile</h2><span className="text-sm text-ink-500">{completion.pct}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.pct}>
              <div className="h-full bg-brand-600" style={{ width: `${completion.pct}%` }} />
            </div>
            <span className="text-xs text-ink-500">Organizations see your skills and verified hours when you apply.</span>
            <Link to="/me/profile" className="text-sm font-semibold text-brand-700 hover:underline">{completion.missing.length ? 'Complete profile' : 'View profile'}</Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Applications</h2>
            {apps.isError ? <p className="text-sm text-ink-500">Applications could not be loaded.</p> : (
              <dl className="grid grid-cols-2 gap-3">
                {([['In review', appSummary?.inProgress], ['Offers to answer', appSummary?.offers], ['Accepted', appSummary?.accepted], ['Closed', appSummary?.closed]] as const).map(([label, v]) => (
                  <div key={label}>
                    <dt className="text-xs text-ink-500">{label}</dt>
                    <dd className="font-display text-xl font-bold tabular-nums text-ink-900">{v ?? '…'}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Link className="text-sm font-semibold text-brand-700 hover:underline" to="/me/applications">All applications &amp; offers</Link>
          </Card>
        </div>
      </section>

      {invites.data && invites.data.length > 0 && (
        <section aria-labelledby="inv-h">
          <h2 id="inv-h" className="mb-3 text-xl font-semibold">Organization invites</h2>
          <ul className="flex flex-col gap-2">
            {invites.data.map((i) => (
              <li key={i.invite_id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <span><strong>{i.org_name}</strong> invited you as <strong>{i.role === 'org_admin' ? 'organization admin' : 'coordinator'}</strong></span>
                  <Button busy={accept.isPending && accept.variables === i.invite_id} onClick={() => accept.mutate(i.invite_id)}>Accept</Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Prototype row 2: four stat tiles (live values from my_impact) */}
      <section aria-labelledby="impact-h">
        <h2 id="impact-h" className="sr-only">Impact</h2>
        {impact.isError && <ErrorState message={toAppError(impact.error).message} onRetry={() => impact.refetch()} />}
        {impact.isPending && <LoadingState label="Loading your impact" />}
        {impact.data && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat icon="award" label="Verified hours" value={Number(impact.data.verified_hours)} caption="confirmed by organizations" />
              <Stat icon="check-circle" label="Shifts attended" value={impact.data.shifts_attended} caption="all time" />
              <Stat icon="calendar" label="Upcoming" value={impact.data.upcoming_confirmed} caption="confirmed" />
              <Stat icon="building" label="Organizations helped" value={impact.data.organizations_helped} caption="all time" />
            </div>
            {impact.data.hours_by_cause.length > 0 && (
              <p className="mt-3 text-sm text-ink-500">
                By cause: {impact.data.hours_by_cause.map((h) => `${CAUSE_LABELS[h.cause]} ${Number(h.hours)}h`).join(' · ')}
              </p>
            )}
          </>
        )}
      </section>

      {/* Prototype row 3: Upcoming (2/3) + Recent updates (1/3) */}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="up-h" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="up-h" className="text-xl font-semibold">Upcoming</h2>
            <Link className="text-sm font-semibold text-brand-700 hover:underline" to="/me/calendar">Open calendar</Link>
          </div>
          {signups.isPending && <LoadingState />}
          {signups.isError && <ErrorState message={toAppError(signups.error).message} onRetry={() => signups.refetch()} />}
          {signups.data && upcoming.length === 0 && (
            <EmptyState title="No upcoming shifts"><Link className="text-brand-700 underline" to="/explore">Find an opportunity</Link></EmptyState>
          )}
          <div className="flex flex-col gap-4">
            {groupByDay(upcoming, (x) => x.shifts!.starts_at, now).map((day) => (
              <div key={day.key}>
                <h3 className="mb-2 text-sm font-semibold text-ink-700">{day.label}</h3>
                <ul className="flex flex-col gap-2">
                  {day.items.map((x) => (
                    <li key={x.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link className="font-semibold text-ink-900 hover:text-brand-700 hover:underline" to={`/opportunities/${x.shifts?.opportunities?.id}`}>{x.shifts?.opportunities?.title ?? 'Opportunity'}</Link>
                          <p className="text-sm text-ink-500">{x.shifts?.opportunities?.organizations?.name} · {x.shifts && formatShiftWindow(x.shifts.starts_at, x.shifts.ends_at)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={x.status} />
                          {(x.status === 'confirmed' || x.status === 'waitlisted') && x.shifts && (
                            <Button variant="ghost" onClick={() => downloadIcs({
                              uid: x.shift_id, title: x.shifts?.opportunities?.title ?? 'Volunteer shift',
                              startsAt: x.shifts!.starts_at, endsAt: x.shifts!.ends_at,
                              description: `Volunteer shift (${x.status}) with ${x.shifts?.opportunities?.organizations?.name ?? 'Worldkin Roster'}`,
                            })}>Add to calendar</Button>
                          )}
                          {(x.status === 'confirmed' || x.status === 'waitlisted') && x.shifts && new Date(x.shifts.starts_at).getTime() > now && (
                            <Button variant="secondary" busy={cancel.isPending && cancel.variables === x.id}
                              onClick={async () => { if (await dialog.confirm({ title: 'Cancel your place?', message: 'If the shift is full, your seat goes to the first person on the waitlist.', confirmLabel: 'Cancel my place', danger: true })) cancel.mutate(x.id) }}>Cancel</Button>
                          )}
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="notes-h" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="notes-h" className="text-xl font-semibold">Recent updates</h2>
            <Link className="text-sm font-semibold text-brand-700 hover:underline" to="/me/notifications">All</Link>
          </div>
          {notes.isPending && <LoadingState label="Loading updates" />}
          {notes.data && notes.data.length === 0 && <p className="text-sm text-ink-500">No updates yet.</p>}
          {notes.data && notes.data.length > 0 && (
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
              {notes.data.slice(0, 3).map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  {!n.read_at && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta-700" />}
                  <div className="min-w-0">
                    <p className={n.read_at ? 'text-sm text-ink-700' : 'text-sm font-semibold text-ink-900'}>
                      {!n.read_at && <span className="sr-only">Unread: </span>}{n.title}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-ink-500">{formatDateTime(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {past.length > 0 && (
        <section aria-labelledby="past-h">
          <h2 id="past-h" className="mb-3 text-xl font-semibold">History</h2>
          <ul className="flex flex-col gap-2">
            {past.map((x) => (
              <li key={x.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm">{x.shifts?.opportunities?.title ?? 'Shift no longer listed'}{x.shifts ? ` · ${formatShiftWindow(x.shifts.starts_at, x.shifts.ends_at)}` : ''}</span>
                  <StatusBadge status={x.status} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
