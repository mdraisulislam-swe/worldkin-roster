import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import {
  APPLICATION_STATUS_LABELS, acceptOffer, declineOffer, getMyApplications, getMyComplaints, getMyParticipation, getNotifications,
  markNotificationsRead, submitComplaint, submitFeedback, withdrawApplication, type MyApplication,
} from '../lib/platform'
import { toAppError } from '../lib/errors'
import { CAUSE_LABELS, formatDateTime, formatShiftWindow } from '../lib/format'
import { useNow } from '../lib/useNow'
import { useDialog } from '../components/dialog'
import { VolunteerNav } from '../components/DashboardNav'
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select, StatusBadge, TextArea, TextField } from '../components/ui'

function hoursLeft(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3_600_000)
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h left` : h >= 1 ? `${h} h left` : `${Math.max(1, Math.round(ms / 60_000))} min left`
}

// ------------------------------------------------------------------ applications & offers
export function MyApplicationsPage() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const now = useNow()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const q = useQuery({ queryKey: ['my-applications'], queryFn: getMyApplications })
  const done = (text: string, tone: 'success' | 'info' = 'success') => {
    setNotice({ tone, text })
    for (const k of ['my-applications', 'my-signups', 'my-impact', 'my-application']) void qc.invalidateQueries({ queryKey: [k] })
  }
  const onError = (e: unknown) => { setNotice({ tone: 'error', text: toAppError(e).message }); void q.refetch() }
  const accept = useMutation({
    mutationFn: acceptOffer,
    onSuccess: (r) => done(r.status === 'confirmed' ? 'Offer accepted — your place on the shift is confirmed.' : `Offer accepted. The shift is full, so you are #${r.waitlist_position} on its waitlist and will be promoted automatically.`),
    onError,
  })
  const decline = useMutation({ mutationFn: declineOffer, onSuccess: () => done('Offer declined.', 'info'), onError })
  const withdraw = useMutation({ mutationFn: withdrawApplication, onSuccess: () => done('Application withdrawn.', 'info'), onError })

  const rows = q.data ?? []
  const offers = rows.filter((a) => a.offer_status === 'pending' && a.offer_expires_at && new Date(a.offer_expires_at).getTime() > now)
  const rest = rows.filter((a) => !offers.includes(a))

  return (
    <>
      <PageHeader title="Applications & offers" subtitle="Track your applications and respond to offers before they expire (72 hours)." />
      <VolunteerNav />
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      {q.isPending && <LoadingState label="Loading applications" />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}

      {offers.length > 0 && (
        <section aria-labelledby="offers-h" className="mb-8">
          <h2 id="offers-h" className="mb-3 text-lg font-semibold">Offers waiting for you</h2>
          <ul className="flex flex-col gap-3">
            {offers.map((a) => (
              <li key={a.offer_id}>
                <Card className="border-brand-600">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold"><Link className="hover:underline" to={`/opportunities/${a.opportunity_id}`}>{a.opportunity_title}</Link></p>
                      <p className="text-sm text-ink-500">{a.org_name}</p>
                      {a.shift_starts_at && a.shift_ends_at && <p className="mt-1 text-sm">Shift: {a.shift_title ?? 'Shift'} · {formatShiftWindow(a.shift_starts_at, a.shift_ends_at)}</p>}
                      {a.offer_message && <p className="mt-1 text-sm text-ink-700">“{a.offer_message}”</p>}
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{hoursLeft(a.offer_expires_at!, now)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button busy={accept.isPending && accept.variables === a.offer_id} onClick={() => accept.mutate(a.offer_id!)}>Accept offer</Button>
                    <Button variant="secondary" busy={decline.isPending && decline.variables === a.offer_id} onClick={async () => {
                      if (await dialog.confirm({ title: 'Decline this offer?', message: 'The organization will be told, and this application will close.', confirmLabel: 'Decline', danger: true }))
                        decline.mutate(a.offer_id!)
                    }}>Decline</Button>
                  </div>
                  <p className="mt-2 text-xs text-ink-500">Accepting books the shift with the same capacity rules as everyone else: confirmed if a seat is free, otherwise a fair waitlist place.</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.data && (
        <section aria-labelledby="apps-h">
          <h2 id="apps-h" className="mb-3 text-lg font-semibold">All applications</h2>
          {rest.length === 0 && offers.length === 0 ? (
            <EmptyState title="No applications yet"><Link className="underline" to="/explore">Explore opportunities</Link> that select volunteers by application.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">{rest.map((a) => <ApplicationRow key={a.application_id} a={a} onWithdraw={async () => {
              if (await dialog.confirm({ title: 'Withdraw this application?', confirmLabel: 'Withdraw', danger: true })) withdraw.mutate(a.application_id)
            }} busy={withdraw.isPending && withdraw.variables === a.application_id} />)}</ul>
          )}
        </section>
      )}
    </>
  )
}

function ApplicationRow({ a, onWithdraw, busy }: { a: MyApplication; onWithdraw: () => void; busy: boolean }) {
  const canWithdraw = ['submitted', 'under_review', 'selected'].includes(a.status) && a.offer_status !== 'accepted'
  return (
    <li>
      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium"><Link className="hover:underline" to={`/opportunities/${a.opportunity_id}`}>{a.opportunity_title}</Link></p>
          <p className="text-sm text-ink-500">{a.org_name} · applied {formatDateTime(a.created_at)}</p>
          {a.status === 'rejected' && a.decision_reason && <p className="mt-1 text-sm text-ink-700">Reason: {a.decision_reason}</p>}
          {a.offer_status === 'accepted' && a.shift_starts_at && a.shift_ends_at && (
            <p className="mt-1 text-sm">Offer accepted · {formatShiftWindow(a.shift_starts_at, a.shift_ends_at)} · place: {a.signup_status ?? '—'}</p>
          )}
          {a.offer_status === 'revoked' && a.status !== 'rejected' && <p className="mt-1 text-sm text-ink-700">The organization withdrew an earlier offer; your application is still being considered.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.offer_status === 'accepted' ? 'accepted' : a.status} />
          <span className="sr-only">{APPLICATION_STATUS_LABELS[a.status]}</span>
          {canWithdraw && <Button variant="secondary" busy={busy} onClick={onWithdraw}>Withdraw</Button>}
        </div>
      </Card>
    </li>
  )
}

// ------------------------------------------------------------------ notifications
export function NotificationsPage() {
  const { session } = useAuth()
  const uid = session!.user.id
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['notifications', uid], queryFn: () => getNotifications(uid) })
  const [markError, setMarkError] = useState<string | null>(null)
  const refreshCounts = () => { void qc.invalidateQueries({ queryKey: ['notifications'] }); void qc.invalidateQueries({ queryKey: ['unread'] }) }
  const markAll = useMutation({
    mutationFn: () => markNotificationsRead(uid),
    onSuccess: () => { setMarkError(null); refreshCounts() },
    onError: (e) => setMarkError(toAppError(e).message),
  })
  // Opening a notification marks only that one as read (own rows only; RLS allows updating read_at).
  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationsRead(uid, [id]),
    onSuccess: refreshCounts,
  })
  const unread = (q.data ?? []).filter((n) => !n.read_at).length
  return (
    <>
      <PageHeader title="Notifications" subtitle="Decisions, offers, promotions and verified hours."
        actions={unread > 0 ? <Button variant="secondary" busy={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button> : undefined} />
      <VolunteerNav />
      <div aria-live="polite">{markError && <div className="mb-4"><Alert tone="error">{markError}</Alert></div>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No notifications yet">Updates about applications, offers, waitlists and verified hours will appear here.</EmptyState>}
      {q.data && q.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {q.data.map((n) => (
            <li key={n.id}>
              <Card className={n.read_at ? '' : 'border-brand-600 bg-brand-50/40'}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{!n.read_at && <span className="sr-only">Unread: </span>}{n.title}</p>
                  <span className="text-xs text-ink-500">{formatDateTime(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-1 text-sm text-ink-700">{n.body}</p>}
                {n.link && <Link to={n.link} onClick={() => { if (!n.read_at) markOne.mutate(n.id) }} className="mt-1 inline-block text-sm text-brand-700 underline">Open</Link>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ------------------------------------------------------------------ complaints (volunteers and organization staff)
export function ComplaintsPage() {
  const { session, memberships } = useAuth()
  const uid = session!.user.id
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const q = useQuery({ queryKey: ['my-complaints', uid], queryFn: () => getMyComplaints(uid) })
  const submit = useMutation({
    mutationFn: (v: { subject: string; description: string }) => submitComplaint(v.subject, v.description, params.get('org'), params.get('opportunity')),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Complaint sent privately to Worldkin administrators. You will be notified of their response.' }); void qc.invalidateQueries({ queryKey: ['my-complaints'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const subject = String(f.get('subject') ?? '').trim(), description = String(f.get('description') ?? '').trim()
    const errs: Record<string, string> = {}
    if (subject.length < 3 || subject.length > 140) errs.subject = 'Subject must be 3–140 characters'
    if (description.length < 10 || description.length > 4000) errs.description = 'Description must be 10–4000 characters'
    setErrors(errs)
    if (Object.keys(errs).length === 0) { submit.mutate({ subject, description }); e.currentTarget.reset() }
  }
  return (
    <>
      <PageHeader title="Private complaints" subtitle="Report a safety, conduct or integrity concern. Only Worldkin administrators can read it — never the organization." />
      {memberships.length === 0 && <VolunteerNav />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">New complaint</h2>
          {params.get('org') && <p className="mb-3 text-sm text-ink-500">About the organization you came from.</p>}
          <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
            <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
            <TextField label="Subject" name="subject" maxLength={140} error={errors.subject} />
            <TextArea label="What happened?" name="description" maxLength={4000} error={errors.description} hint="Include dates and what you observed. Do not include other people's private contact details." />
            <div><Button type="submit" busy={submit.isPending}>Send privately</Button></div>
          </form>
        </Card>
        <section aria-labelledby="mine-h">
          <h2 id="mine-h" className="mb-3 font-semibold">Your complaints</h2>
          {q.isPending ? <LoadingState /> : q.isError ? <ErrorState message={toAppError(q.error).message} /> : q.data.length === 0 ? <EmptyState title="No complaints filed" /> : (
            <ul className="flex flex-col gap-2">
              {q.data.map((c) => (
                <li key={c.id}><Card>
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{c.subject}</p><StatusBadge status={c.status} /></div>
                  <p className="text-xs text-ink-500">{formatDateTime(c.created_at)}{c.organizations ? ` · ${c.organizations.name}` : ''}{c.opportunities ? ` · ${c.opportunities.title}` : ''}</p>
                  {c.admin_response && <p className="mt-2 rounded-md bg-brand-50 p-2 text-sm"><span className="font-medium">Worldkin response:</span> {c.admin_response}</p>}
                </Card></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ participation history, feedback, certificates
export function ParticipationSection() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['my-participation'], queryFn: getMyParticipation })
  const [open, setOpen] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const fb = useMutation({
    mutationFn: (v: { id: string; rating: number; comment: string | null }) => submitFeedback(v.id, v.rating, v.comment),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Thank you — your feedback is published on the organization’s page (first name only).' }); setOpen(null); void qc.invalidateQueries({ queryKey: ['my-participation'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  if (q.isPending) return <LoadingState label="Loading participation" />
  if (q.isError) return <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />
  if (q.data.length === 0) return null
  return (
    <section aria-labelledby="hist-h" className="mx-auto mt-8 max-w-3xl print:hidden">
      <h2 id="hist-h" className="mb-3 text-lg font-semibold">Participation history, feedback &amp; certificates</h2>
      <div aria-live="polite">{notice && <div className="mb-3"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      <ul className="flex flex-col gap-2">
        {q.data.map((p) => (
          <li key={p.participation_id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{p.opportunity_title}</p>
                  <p className="text-sm text-ink-500">{p.org_name} · {formatShiftWindow(p.starts_at, p.ends_at)} · {Number(p.hours)} verified h</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5" to={`/me/certificate/${p.participation_id}`}>Certificate</Link>
                  {p.feedback_id
                    ? <span className="self-center text-sm text-ink-500">Feedback given: {'★'.repeat(p.feedback_rating ?? 0)}</span>
                    : <Button variant="secondary" onClick={() => setOpen(open === p.participation_id ? null : p.participation_id)} aria-expanded={open === p.participation_id}>Leave feedback</Button>}
                </div>
              </div>
              {open === p.participation_id && (
                <form className="mt-3 grid gap-3 sm:grid-cols-4" onSubmit={(e) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  const comment = String(f.get('comment') ?? '').trim()
                  fb.mutate({ id: p.participation_id, rating: Number(f.get('rating')), comment: comment || null })
                }}>
                  <Select label="Rating" name="rating" defaultValue="5" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} — ${['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][n]}` }))} />
                  <div className="sm:col-span-3"><TextField label="Comment (optional, public)" name="comment" maxLength={1000} /></div>
                  <div className="sm:col-span-4"><Button type="submit" busy={fb.isPending}>Publish feedback</Button></div>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CertificatePage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const q = useQuery({ queryKey: ['my-participation'], queryFn: getMyParticipation })
  if (q.isPending) return <LoadingState label="Preparing certificate" />
  if (q.isError) return <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />
  const p = q.data.find((x) => x.participation_id === id)
  if (!p) return <ErrorState title="Certificate not available" message="Certificates exist only for your own verified participation." />
  return (
    <article className="mx-auto max-w-2xl rounded-lg border-4 border-double border-brand-700 bg-white p-8 text-center print:border-brand-700">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-700">Worldkin Roster</p>
      <h1 className="mt-2 text-3xl font-semibold">Certificate of Volunteer Participation</h1>
      <p className="mt-6 text-ink-700">This certifies that</p>
      <p className="mt-1 text-2xl font-semibold">{profile?.full_name}</p>
      <p className="mt-4 text-ink-700">contributed <strong>{Number(p.hours)} verified hour{Number(p.hours) === 1 ? '' : 's'}</strong> to</p>
      <p className="mt-1 text-lg font-medium">{p.opportunity_title}</p>
      <p className="text-ink-700">with <strong>{p.org_name}</strong> ({CAUSE_LABELS[p.cause]})</p>
      <p className="mt-4 text-sm text-ink-500">Shift: {formatShiftWindow(p.starts_at, p.ends_at)} · verified {formatDateTime(p.verified_at)}</p>
      <p className="mt-6 text-xs text-ink-500">Attendance was confirmed by the organization’s staff in Worldkin Roster; volunteers cannot record their own hours. Reference: {p.participation_id}</p>
      <div className="mt-6 flex justify-center gap-2 print:hidden">
        <Link to="/me/record" className="rounded-md px-3 py-2 text-sm text-brand-700 hover:bg-brand-50">Back</Link>
        <Button onClick={() => window.print()}>Print / save as PDF</Button>
      </div>
    </article>
  )
}
