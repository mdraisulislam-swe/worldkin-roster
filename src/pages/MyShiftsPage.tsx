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

export function MyShiftsPage() {
  const { session, refresh } = useAuth()
  const uid = session!.user.id
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const signups = useQuery({ queryKey: ['my-signups', uid], queryFn: () => getMySignups(uid) })
  const impact = useQuery({ queryKey: ['my-impact', uid], queryFn: getMyImpact })
  const invites = useQuery({ queryKey: ['my-invites', uid], queryFn: getMyInvites })

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

  return (
    <>
      <PageHeader title="My shifts" subtitle="Your places, waitlists and verified volunteer hours."
        actions={<Link to="/me/record" className="rounded-md border border-black/15 bg-white px-3.5 py-2 text-sm font-medium hover:bg-black/5">Verified record</Link>} />
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>

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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <section aria-labelledby="up-h">
        <h2 id="up-h" className="mb-3 text-lg font-semibold">Upcoming</h2>
        {signups.isPending && <LoadingState />}
        {signups.isError && <ErrorState message={toAppError(signups.error).message} onRetry={() => signups.refetch()} />}
        {signups.data && upcoming.length === 0 && (
          <EmptyState title="No upcoming shifts"><Link className="text-brand-700 underline" to="/explore">Find an opportunity</Link></EmptyState>
        )}
        <ul className="flex flex-col gap-2">
          {upcoming.map((s) => (
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
