import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { cancelSignup, getOpportunity, getShiftAvailability, joinShift } from '../lib/api'
import { downloadIcs } from '../lib/calendar'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, MODE_LABELS, formatShiftWindow, matchingSkills, shiftHours, startsIn } from '../lib/format'
import { Alert, Button, CapacityMeter, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui'
import { useDialog } from '../components/dialog'
import { ApplyPanel } from '../components/ApplyPanel'
import { CompensationBadge } from '../components/cards'
import { COMPENSATION_LABELS, type OpportunityExtra } from '../lib/platform'

export function OpportunityPage() {
  const { id = '' } = useParams()
  const { session, profile } = useAuth()
  const location = useLocation()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const now = useNow()

  const opp = useQuery({ queryKey: ['opportunity', id], queryFn: () => getOpportunity(id) })
  const shifts = useQuery({ queryKey: ['availability', id, session?.user.id], queryFn: () => getShiftAvailability(id) })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['availability', id] })
    void qc.invalidateQueries({ queryKey: ['my-signups'] })
  }

  const join = useMutation({
    mutationFn: (shiftId: string) => joinShift(shiftId),
    onSuccess: (r) => {
      setNotice(
        r.status === 'confirmed'
          ? { tone: 'success', text: r.replayed ? 'You were already confirmed for this shift.' : 'You are confirmed for this shift. Add it to your calendar below.' }
          : { tone: 'info', text: `The shift is full — you are #${r.waitlist_position} on the waitlist. You will be promoted automatically if a seat frees up.` },
      )
      refresh()
    },
    onError: (err) => { setNotice({ tone: 'error', text: toAppError(err).message }); refresh() },
  })
  const cancel = useMutation({
    mutationFn: (signupId: string) => cancelSignup(signupId),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Your place was cancelled. If anyone was waiting, they have been promoted.' }); refresh() },
    onError: (err) => setNotice({ tone: 'error', text: toAppError(err).message }),
  })

  if (opp.isPending) return <LoadingState />
  if (opp.isError) return <ErrorState message={toAppError(opp.error).message} onRetry={() => opp.refetch()} />
  const o = opp.data as typeof opp.data & OpportunityExtra
  const byApplication = o.selection_mode === 'application'
  const matches = profile ? matchingSkills(profile.skills, o.skills_wanted) : []
  const place = [o.city, o.country_code].filter(Boolean).join(', ')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice({ tone: 'success', text: 'Link copied — share it with friends who may want to help.' })
    } catch {
      setNotice({ tone: 'error', text: 'Could not copy the link. Copy it from the address bar instead.' })
    }
  }

  return (
    <>
      <PageHeader
        title={o.title}
        subtitle={<>{CAUSE_LABELS[o.cause]} · {MODE_LABELS[o.mode]}{place ? ` · ${place}` : ''}</>}
        actions={<Button variant="secondary" onClick={copyLink}>Copy link</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <h2 className="mb-2 font-semibold">About this opportunity</h2>
            <p className="whitespace-pre-line text-ink-700">{o.description}</p>
            {o.is_sensitive && <div className="mt-4"><Alert tone="warning">Sensitive opportunity. Location details are shared only by the coordinator after confirmation.</Alert></div>}
          </Card>
          <Card>
            <h2 className="mb-2 flex flex-wrap items-center gap-2 font-semibold">Compensation <CompensationBadge type={o.compensation_type} /></h2>
            {o.compensation_type === 'voluntary'
              ? <p className="text-sm text-ink-700">This is an unpaid, voluntary role.</p>
              : <p className="text-sm text-ink-700"><span className="font-medium">{COMPENSATION_LABELS[o.compensation_type]}:</span> {o.compensation_details}</p>}
            <p className="mt-2 text-sm text-ink-500">{byApplication ? 'Selection by application: the organization reviews applicants and sends offers.' : 'Open sign-up: join any shift with free seats.'}</p>
            {o.moderation_reason && <div className="mt-3"><Alert tone="warning">Closed by Worldkin moderators: {o.moderation_reason}</Alert></div>}
            <p className="mt-3 border-t border-black/5 pt-3 text-xs text-ink-500">
              Something misleading about this listing (pay, location, organization)?{' '}
              <Link className="text-brand-700 underline" to={`/me/complaints?org=${o.org_id}&opportunity=${o.id}`}>Report it to Worldkin moderators</Link>.
            </p>
          </Card>
          {(o.skills_wanted.length > 0 || o.requirements) && (
            <Card>
              <h2 className="mb-2 font-semibold">Skills and eligibility</h2>
              {o.skills_wanted.length > 0 && (
                <p className="text-sm"><span className="font-medium">Skills wanted:</span> {o.skills_wanted.join(', ')}{o.requires_skill_match ? ' — at least one is required' : ''}</p>
              )}
              {o.requirements && <p className="mt-2 text-sm"><span className="font-medium">Requirements:</span> {o.requirements}</p>}
              {session && o.skills_wanted.length > 0 && (
                <div className="mt-3">
                  {matches.length > 0 ? (
                    <Alert tone="success">Your profile matches: {matches.join(', ')}.</Alert>
                  ) : (
                    <Alert tone={o.requires_skill_match ? 'warning' : 'info'}>
                      None of your profile skills match{o.requires_skill_match ? ', so you cannot join yet' : ''}.{' '}
                      <Link className="underline" to="/me/profile">Update your skills</Link>
                    </Alert>
                  )}
                </div>
              )}
            </Card>
          )}
          {o.organizations && (
            <Card>
              <h2 className="mb-1 font-semibold">Organized by {o.organizations.name}</h2>
              {o.organizations.status === 'verified' && (
                <p className="text-sm text-emerald-900">✓ Verified by Worldkin platform administrators</p>
              )}
              {o.organizations.website && (
                <a className="mt-1 inline-block text-sm text-brand-700 underline" href={o.organizations.website} target="_blank" rel="noreferrer noopener">Visit website</a>
              )}
            </Card>
          )}
        </div>
        <section aria-labelledby="shifts-h">
          <h2 id="shifts-h" className="mb-3 text-lg font-semibold">Shifts</h2>
          {byApplication && o.status === 'published' && <ApplyPanel opportunityId={o.id} deadline={o.application_deadline} now={now} />}
          <div aria-live="polite">{notice && <div className="mb-3"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
          {shifts.isPending && <LoadingState label="Loading shifts" />}
          {shifts.isError && <ErrorState message={toAppError(shifts.error).message} onRetry={() => shifts.refetch()} />}
          {shifts.data && shifts.data.filter((s) => s.status !== 'cancelled' || s.my_status).length === 0 && <EmptyState title="No shifts scheduled yet" />}
          <ul className="flex flex-col gap-3">
            {/* Hide cancelled shifts unless the viewer had a place on them. */}
            {shifts.data?.filter((s) => s.status !== 'cancelled' || s.my_status).map((s) => {
              const started = new Date(s.starts_at).getTime() <= now
              const active = s.my_status === 'confirmed' || s.my_status === 'waitlisted'
              return (
                <li key={s.shift_id}>
                  <Card>
                    <p className="font-medium">{s.title ?? 'Shift'}</p>
                    <p className="text-sm text-ink-500">{formatShiftWindow(s.starts_at, s.ends_at)} · {shiftHours(s.starts_at, s.ends_at)} h</p>
                    {!started && s.status === 'scheduled' && <p className="text-xs text-brand-800">{startsIn(s.starts_at, now)}</p>}
                    <div className="mt-2"><CapacityMeter confirmed={s.confirmed} capacity={s.capacity} waitlisted={s.waitlisted} /></div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {s.my_status && <StatusBadge status={s.my_status} />}
                      {s.status === 'cancelled' ? <StatusBadge status="cancelled" /> : started ? (
                        <span className="text-xs text-ink-500">Started</span>
                      ) : byApplication && !s.my_status ? (
                        <span className="text-xs text-ink-500">Places are assigned through offers</span>
                      ) : !session ? (
                        <Link to={`/signin?next=${encodeURIComponent(location.pathname)}`} className="text-sm text-brand-700 underline">Sign in to join</Link>
                      ) : active ? (
                        <>
                          <Button variant="ghost" onClick={() => downloadIcs({
                            uid: s.shift_id, title: `${o.title} — ${o.organizations?.name ?? 'Worldkin'}`, startsAt: s.starts_at, endsAt: s.ends_at,
                            description: `Volunteer shift (${s.my_status}). ${window.location.href}`, location: o.is_sensitive ? undefined : place || undefined,
                          })}>Add to calendar</Button>
                          <Button variant="secondary" busy={cancel.isPending && cancel.variables === s.my_signup_id}
                            onClick={async () => {
                              const ok = await dialog.confirm({ title: 'Cancel your place?', message: 'If the shift is full, your seat goes to the first person on the waitlist.', confirmLabel: 'Cancel my place', danger: true })
                              if (ok) cancel.mutate(s.my_signup_id)
                            }}>
                            Cancel my place
                          </Button>
                        </>
                      ) : (
                        <Button busy={join.isPending && join.variables === s.shift_id} onClick={() => join.mutate(s.shift_id)}>
                          {s.open_spots > 0 ? 'Join shift' : 'Join waitlist'}
                        </Button>
                      )}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
  )
}
