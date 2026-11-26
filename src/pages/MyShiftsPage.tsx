import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { acceptInvite, cancelSignup, getMyImpact, getMyInvites, getMySignups } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, formatShiftWindow } from '../lib/format'
import { downloadIcs } from '../lib/calendar'
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Stat, StatusBadge } from '../components/ui'
import { useDialog } from '../components/dialog'
import { VolunteerNav } from '../components/DashboardNav'
import { getMyApplications, getNotifications } from '../lib/platform'
import { firstName, groupByDay, profileCompletion, summarizeApplications } from '../lib/dashboard'
import { formatDateTime } from '../lib/format'

function NextStep({ text, to, cta, tone }: { text: string; to: string; cta: string; tone?: 'action' }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className={tone === 'action' ? 'text-sm font-medium text-ink-900' : 'text-sm text-ink-700'}>{text}</span>
      <Link to={to} className={tone === 'action'
        ? 'shrink-0 rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800'
        : 'shrink-0 rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:bg-black/5'}>{cta}</Link>
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
    <>
      <PageHeader title={name ? `Welcome back, ${name}` : 'Volunteer dashboard'} subtitle="Your applications, offers, shifts and verified volunteer hours in one place."
        actions={<Link to="/explore" className="rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800">Find opportunities</Link>} />
      <VolunteerNav />
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>

      <section className="mb-8 grid gap-4 lg:grid-cols-3" aria-labelledby="next-h">
        <Card className="lg:col-span-2">
          <h2 id="next-h" className="text-lg font-semibold">Next steps</h2>
          <ul className="mt-3 flex flex-col divide-y divide-black/5">
            {appSummary && appSummary.offers > 0 && (
              <NextStep tone="action" text={`You have ${appSummary.offers} offer${appSummary.offers === 1 ? '' : 's'} waiting for your answer. Offers expire after 72 hours.`} to="/me/applications" cta="Respond to offers" />
            )}
            {completion.missing.length > 0 && (
              <NextStep text={`Complete your profile (${completion.done}/${completion.total}): add ${completion.missing.slice(0, 3).join(', ').toLowerCase()}${completion.missing.length > 3 ? '…' : ''}. Organizations see it when you apply.`} to="/me/profile" cta="Edit profile" />
            )}
            {signups.data && upcoming.length === 0 && (
              <NextStep text="You have no upcoming shifts. Browse open opportunities and join or apply." to="/explore" cta="Explore" />
            )}
            {appSummary && appSummary.inProgress > 0 && (
              <NextStep text={`${appSummary.inProgress} application${appSummary.inProgress === 1 ? ' is' : 's are'} being reviewed by organizations.`} to="/me/applications" cta="View" />
            )}
            {appSummary && appSummary.offers === 0 && completion.missing.length === 0 && upcoming.length > 0 && appSummary.inProgress === 0 && (
              <li className="py-2 text-sm text-ink-700">You are all set. See your upcoming shifts below.</li>
            )}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Applications</h2>
          {apps.isError ? <p className="mt-3 text-sm text-ink-500">Applications could not be loaded.</p> : (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {([['In review', appSummary?.inProgress], ['Offers to answer', appSummary?.offers], ['Accepted', appSummary?.accepted], ['Closed', appSummary?.closed]] as const).map(([label, v]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd className="text-xl font-semibold text-ink-900">{v ?? '…'}</dd>
                </div>
              ))}
            </dl>
          )}
          <Link className="mt-3 inline-block text-sm text-brand-700 underline" to="/me/applications">All applications &amp; offers</Link>
        </Card>
      </section>

      {invites.data && invites.data.length > 0 && (
        <section className="mb-8" aria-labelledby="inv-h">
          <h2 id="inv-h" className="mb-3 text-lg font-semibold">Organization invites</h2>
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

      <section className="mb-8" aria-labelledby="impact-h">
        <h2 id="impact-h" className="mb-3 text-lg font-semibold">Impact</h2>
        {impact.isError && <ErrorState message={toAppError(impact.error).message} onRetry={() => impact.refetch()} />}
        {impact.data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Verified hours" value={Number(impact.data.verified_hours)} />
              <Stat label="Shifts attended" value={impact.data.shifts_attended} />
              <Stat label="Upcoming (confirmed)" value={impact.data.upcoming_confirmed} />
              <Stat label="Organizations helped" value={impact.data.organizations_helped} />
            </div>
            {impact.data.hours_by_cause.length > 0 && (
              <p className="mt-3 text-sm text-ink-500">
                By cause: {impact.data.hours_by_cause.map((h) => `${CAUSE_LABELS[h.cause]} ${Number(h.hours)}h`).join(' · ')}
              </p>
            )}
          </>
        )}
      </section>

      {notes.data && notes.data.length > 0 && (
        <section className="mb-8" aria-labelledby="notes-h">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="notes-h" className="text-lg font-semibold">Recent updates</h2>
            <Link className="text-sm text-brand-700 underline" to="/me/notifications">All notifications</Link>
          </div>
          <ul className="flex flex-col divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
            {notes.data.slice(0, 3).map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className={n.read_at ? 'text-sm text-ink-700' : 'text-sm font-semibold text-ink-900'}>
                    {!n.read_at && <span className="sr-only">Unread: </span>}{n.title}
                  </p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-ink-500">{formatDateTime(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="up-h">
        <h2 id="up-h" className="mb-3 text-lg font-semibold">Upcoming</h2>
        {signups.isPending && <LoadingState />}
        {signups.isError && <ErrorState message={toAppError(signups.error).message} onRetry={() => signups.refetch()} />}
        {signups.data && upcoming.length === 0 && (
          <EmptyState title="No upcoming shifts"><Link className="text-brand-700 underline" to="/explore">Find an opportunity</Link></EmptyState>
        )}
        <div className="flex flex-col gap-5">
          {groupByDay(upcoming, (s) => s.shifts!.starts_at, now).map((day) => (
            <div key={day.key}>
              <h3 className="mb-2 text-sm font-semibold text-ink-700">{day.label}</h3>
        <ul className="flex flex-col gap-2">
          {day.items.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link className="font-medium hover:underline" to={`/opportunities/${s.shifts?.opportunities?.id}`}>{s.shifts?.opportunities?.title ?? 'Opportunity'}</Link>
                  <p className="text-sm text-ink-500">{s.shifts?.opportunities?.organizations?.name} · {s.shifts && formatShiftWindow(s.shifts.starts_at, s.shifts.ends_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {(s.status === 'confirmed' || s.status === 'waitlisted') && s.shifts && (
                    <Button variant="ghost" onClick={() => downloadIcs({
                      uid: s.shift_id, title: s.shifts?.opportunities?.title ?? 'Volunteer shift',
                      startsAt: s.shifts!.starts_at, endsAt: s.shifts!.ends_at,
                      description: `Volunteer shift (${s.status}) with ${s.shifts?.opportunities?.organizations?.name ?? 'Worldkin Roster'}`,
                    })}>Add to calendar</Button>
                  )}
                  {(s.status === 'confirmed' || s.status === 'waitlisted') && s.shifts && new Date(s.shifts.starts_at).getTime() > now && (
                    <Button variant="secondary" busy={cancel.isPending && cancel.variables === s.id}
                      onClick={async () => { if (await dialog.confirm({ title: 'Cancel your place?', message: 'If the shift is full, your seat goes to the first person on the waitlist.', confirmLabel: 'Cancel my place', danger: true })) cancel.mutate(s.id) }}>Cancel</Button>
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

      {past.length > 0 && (
        <section className="mt-8" aria-labelledby="past-h">
          <h2 id="past-h" className="mb-3 text-lg font-semibold">History</h2>
          <ul className="flex flex-col gap-2">
            {past.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm">{s.shifts?.opportunities?.title ?? 'Shift no longer listed'}{s.shifts ? ` · ${formatShiftWindow(s.shifts.starts_at, s.shifts.ends_at)}` : ''}</span>
                  <StatusBadge status={s.status} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
