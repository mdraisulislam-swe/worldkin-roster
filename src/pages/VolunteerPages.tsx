import { Fragment, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import {
  APPLICATION_STATUS_LABELS, acceptOffer, declineOffer, getMyApplications, getMyComplaints, getMyParticipation, getNotifications,
  markNotificationsRead, submitComplaint, submitFeedback, withdrawApplication, type MyApplication,
} from '../lib/platform'
import { toAppError } from '../lib/errors'
import { CAUSE_LABELS, formatDateTime, formatShiftWindow, timeAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import { useDialog } from '../components/dialog'
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select, StatusBadge, Tabs, TextArea, TextField } from '../components/ui'
import { TABLE } from '../lib/table'
import { APP_TABS, appTabOf, type AppTab } from '../lib/appTabs'
import { Icon } from '../components/Icon'
import { PIN_CLASS, notificationPin } from '../lib/notificationKinds'

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
  // Prototype tabs: client-side filter of the rows already loaded.
  const [tab, setTab] = useState<AppTab>('all')
  const counts = Object.fromEntries(APP_TABS.map((t) => [t.value, rows.filter((a) => appTabOf(a) === t.value || t.value === 'all').length])) as Record<AppTab, number>
  const shown = rows.filter((a) => tab === 'all' || appTabOf(a) === tab)

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Applications & offers" subtitle="Track your applications and respond to offers before they expire (72 hours)." />
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {q.isPending && <LoadingState label="Loading applications" />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}

      {offers.length > 0 && (
        <section aria-labelledby="offers-h">
          <h2 id="offers-h" className="sr-only">Offers waiting for you</h2>
          <ul className="flex flex-col gap-3">
            {offers.map((a) => (
              <li key={a.offer_id}>
                <div className="flex flex-col gap-3 rounded-xl border border-sky-300 bg-sky-50 p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-start gap-2 font-semibold text-ink-900"><Icon name="briefcase" className="mt-0.5 text-sky-800" />
                        <span>You have been selected: <Link className="hover:underline" to={`/opportunities/${a.opportunity_id}`}>{a.opportunity_title}</Link></span></p>
                      <p className="mt-1 text-sm text-ink-700">{a.org_name}{a.shift_starts_at && a.shift_ends_at ? ` · ${a.shift_title ?? 'Shift'} · ${formatShiftWindow(a.shift_starts_at, a.shift_ends_at)}` : ''}</p>
                      {a.offer_message && <p className="mt-1 text-sm text-ink-700">“{a.offer_message}”</p>}
                    </div>
                    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#fbeee4] px-2.5 text-[12.5px] font-semibold text-terracotta-700"><Icon name="clock" size={14} />{hoursLeft(a.offer_expires_at!, now)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button busy={accept.isPending && accept.variables === a.offer_id} onClick={() => accept.mutate(a.offer_id!)}>Accept offer</Button>
                    <Button variant="secondary" busy={decline.isPending && decline.variables === a.offer_id} onClick={async () => {
                      if (await dialog.confirm({ title: 'Decline this offer?', message: 'The organization will be told, and this application will close.', confirmLabel: 'Decline', danger: true }))
                        decline.mutate(a.offer_id!)
                    }}>Decline</Button>
                  </div>
                  <p className="text-xs text-ink-700">Accepting books the shift with the same capacity rules as everyone else: confirmed if a seat is free, otherwise a fair waitlist place — never overbooked.</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.data && (
        <section aria-labelledby="apps-h" className="flex flex-col gap-4">
          <h2 id="apps-h" className="sr-only">All applications</h2>
          {rows.length === 0 ? (
            <EmptyState title="No applications yet"><Link className="underline" to="/explore">Explore opportunities</Link> that select volunteers by application.</EmptyState>
          ) : (
            <>
              <Tabs label="Filter applications" controls="apps-panel" value={tab} onChange={setTab} tabs={APP_TABS.map((t) => ({ ...t, count: counts[t.value] }))} />
              <div id="apps-panel" role="tabpanel" aria-labelledby={`tab-apps-panel-${tab}`}>
                {shown.length === 0 ? <p className="py-4 text-sm text-ink-500">Nothing in this group.</p> : (
                  <div className={TABLE.wrap}>
                    <table className={TABLE.table}>
                      <caption className="sr-only">Your applications</caption>
                      <thead className={TABLE.thead}>
                        <tr>
                          <th scope="col" className={TABLE.th}>Opportunity</th>
                          <th scope="col" className={TABLE.th}>Organization</th>
                          <th scope="col" className={TABLE.th}>Applied</th>
                          <th scope="col" className={TABLE.th}>Status</th>
                          <th scope="col" className={TABLE.th}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className={TABLE.tbody}>
                        {shown.map((a) => <ApplicationRow key={a.application_id} a={a} onWithdraw={async () => {
                          if (await dialog.confirm({ title: 'Withdraw this application?', confirmLabel: 'Withdraw', danger: true })) withdraw.mutate(a.application_id)
                        }} busy={withdraw.isPending && withdraw.variables === a.application_id} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}


function ApplicationRow({ a, onWithdraw, busy }: { a: MyApplication; onWithdraw: () => void; busy: boolean }) {
  const canWithdraw = ['submitted', 'under_review', 'selected'].includes(a.status) && a.offer_status !== 'accepted'
  return (
    <tr className={TABLE.tr}>
      <td className={TABLE.td}>
        <div className="min-w-0">
          <p className="font-semibold"><Link className="text-ink-900 hover:text-brand-700 hover:underline" to={`/opportunities/${a.opportunity_id}`}>{a.opportunity_title}</Link></p>
          <p className="text-xs text-ink-500 md:hidden">{a.org_name} · applied {formatDateTime(a.created_at)}</p>
          {a.status === 'rejected' && a.decision_reason && <p className="mt-1 text-sm text-ink-700">Reason: {a.decision_reason}</p>}
          {a.offer_status === 'accepted' && a.shift_starts_at && a.shift_ends_at && (
            <p className="mt-1 text-sm">Offer accepted · {formatShiftWindow(a.shift_starts_at, a.shift_ends_at)} · place: {a.signup_status ?? '—'}</p>
          )}
          {a.offer_status === 'revoked' && a.status !== 'rejected' && <p className="mt-1 text-sm text-ink-700">The organization withdrew an earlier offer; your application is still being considered.</p>}
        </div>
      </td>
      <td className={`${TABLE.td} ${TABLE.hideSm}`}>{a.org_name}</td>
      <td className={`${TABLE.td} ${TABLE.hideSm} whitespace-nowrap`}>{formatDateTime(a.created_at)}</td>
      <td className={TABLE.td}>
        <StatusBadge status={a.offer_status === 'accepted' ? 'accepted' : a.status} />
        <span className="sr-only">{APPLICATION_STATUS_LABELS[a.status]}</span>
      </td>
      <td className={`${TABLE.td} ${TABLE.fullSm} text-right max-md:text-left`}>
        {canWithdraw && <Button size="sm" variant="secondary" busy={busy} onClick={onWithdraw}>Withdraw</Button>}
      </td>
    </tr>
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
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const nowN = useNow(60_000)
  const shown = (q.data ?? []).filter((n) => tab === 'all' || !n.read_at)
  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Notifications" subtitle="Decisions, offers, waitlist promotions and verified hours."
        actions={unread > 0 ? <Button variant="secondary" busy={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button> : undefined} />
      <div aria-live="polite" className="empty:-mt-6">{markError && <Alert tone="error">{markError}</Alert>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No notifications yet">Updates about applications, offers, waitlists and verified hours will appear here.</EmptyState>}
      {q.data && q.data.length > 0 && (
        <>
          <Tabs label="Filter notifications" controls="notes-panel" value={tab} onChange={setTab}
            tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread }]} />
          <div id="notes-panel" role="tabpanel" aria-labelledby={`tab-notes-panel-${tab}`}>
            {shown.length === 0 ? <p className="py-4 text-sm text-ink-500">You're all caught up.</p> : (
              <ul className="overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
                {shown.map((n) => {
                  const [icon, tone] = notificationPin(n.kind)
                  const row = (
                    <>
                      <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${PIN_CLASS[tone]}`}><Icon name={icon} size={18} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className={`text-sm ${n.read_at ? 'text-ink-900' : 'font-semibold text-ink-900'}`}>{!n.read_at && <span className="sr-only">Unread: </span>}{n.title}</span>
                        {n.body && <span className="text-xs text-ink-500">{n.body}</span>}
                      </span>
                      <time dateTime={n.created_at} title={formatDateTime(n.created_at)} className="whitespace-nowrap text-xs text-ink-500">{timeAgo(n.created_at, nowN)}</time>
                      {!n.read_at && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta-700" />}
                    </>
                  )
                  const cls = `flex items-start gap-4 border-b border-neutral-100 px-5 py-4 last:border-b-0 ${n.read_at ? '' : 'bg-[#f6fbf9]'}`
                  return (
                    <li key={n.id} className="border-b border-neutral-100 last:border-b-0">
                      {n.link
                        // Opening a notification marks only that one as read (own rows only; RLS allows updating read_at).
                        ? <Link to={n.link} onClick={() => { if (!n.read_at) markOne.mutate(n.id) }} className={`${cls} border-b-0 hover:bg-[#fbfcfa]`}>{row}</Link>
                        : <div className={`${cls} border-b-0`}>{row}</div>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <p className="-mt-3 flex items-center gap-1.5 text-xs text-ink-500"><Icon name="info" size={12} />Opening a notification marks it as read. Email notifications are a separate, future capability.</p>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ complaints (volunteers and organization staff)
export function ComplaintsPage() {
  const { session } = useAuth()
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
const issuedFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

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
    <section aria-labelledby="hist-h" className="flex flex-col gap-4 print:hidden">
      <div>
        <h2 id="hist-h" className="text-xl font-semibold">Certificates</h2>
        <p className="text-sm text-ink-500">Issued automatically for each verified participation. You can also leave feedback for the organization.</p>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Icon name="info" size={18} />
        <span><strong>Public verification links</strong> (unique code / QR) are a planned feature — not active yet. Today a certificate can be printed by its owner.</span>
      </div>
      <div aria-live="polite" className="empty:-mt-4">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      <div className={TABLE.wrap}>
        <table className={TABLE.table}>
          <caption className="sr-only">Certificates</caption>
          <thead className={TABLE.thead}>
            <tr>
              <th scope="col" className={TABLE.th}>Certificate</th>
              <th scope="col" className={TABLE.th}>Issued</th>
              <th scope="col" className={TABLE.th}>Hours</th>
              <th scope="col" className={TABLE.th}>Status</th>
              <th scope="col" className={TABLE.th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={TABLE.tbody}>
        {q.data.map((p) => (
          <Fragment key={p.participation_id}>
            <tr className={TABLE.tr}>
              <td className={TABLE.td}>
                <Link className="font-semibold text-brand-700 hover:underline" to={`/me/certificate/${p.participation_id}`}>{p.opportunity_title}</Link>
                <p className="text-xs text-ink-500">{p.org_name}<span className="md:hidden"> · {formatShiftWindow(p.starts_at, p.ends_at)}</span></p>
              </td>
              <td className={`${TABLE.td} ${TABLE.hideSm} whitespace-nowrap`}>{issuedFmt.format(new Date(p.starts_at))}</td>
              <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{Number(p.hours)} h</td>
              <td className={`${TABLE.td} ${TABLE.hideSm}`}><StatusBadge status="verified" /></td>
              <td className={`${TABLE.td} ${TABLE.fullSm} text-right max-md:text-left`}>
                {p.feedback_id
                  ? <span className="text-sm text-ink-500">Feedback given: {'★'.repeat(p.feedback_rating ?? 0)}</span>
                  : <Button size="sm" variant="secondary" onClick={() => setOpen(open === p.participation_id ? null : p.participation_id)} aria-expanded={open === p.participation_id}>Leave feedback</Button>}
              </td>
            </tr>
              {open === p.participation_id && (
              <tr className="border-t border-neutral-100 bg-[#fbfcfa] max-md:block"><td colSpan={5} className="px-4 py-4 max-md:block">
                <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  const comment = String(f.get('comment') ?? '').trim()
                  fb.mutate({ id: p.participation_id, rating: Number(f.get('rating')), comment: comment || null })
                }}>
                  <Select label="Rating" name="rating" defaultValue="5" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} — ${['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][n]}` }))} />
                  <div className="sm:col-span-3"><TextField label="Comment (optional, public)" name="comment" maxLength={1000} /></div>
                  <div className="sm:col-span-4"><Button type="submit" busy={fb.isPending}>Publish feedback</Button></div>
                </form>
              </td></tr>
              )}
          </Fragment>
        ))}
          </tbody>
        </table>
      </div>
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
