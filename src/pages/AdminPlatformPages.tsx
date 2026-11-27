import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import {
  COMPENSATION_LABELS, getAdminOverview, getAdminUsers, getAllComplaints, getAllFeedback, getOpportunitiesForModeration, getOrgPrivate,
  moderateFeedback, moderateOpportunity, respondComplaint, setSuspension, type ComplaintStatus,
} from '../lib/platform'
import { toAppError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { getAuditLog } from '../lib/api'
import { Icon } from '../components/Icon'
import { useDialog } from '../components/dialog'
import { DocLink } from './OrgPlatformPages'
import { Alert, Button, Card, EmptyState, ErrorState, Initials, LoadingState, PageHeader, Stat, StatusBadge, Tabs, TextField } from '../components/ui'
import { TABLE } from '../lib/table'


type Notice = { tone: 'success' | 'error'; text: string } | null

/** Prototype "Content moderation" tabs. Each tab stays its own route (no URL change). */
function ModerationNav() {
  const tab = ({ isActive }: { isActive: boolean }) => `-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14.5px] font-medium ${isActive ? 'border-brand-700 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`
  return (
    <nav aria-label="Moderation sections" className="flex gap-1 overflow-x-auto border-b border-neutral-100 [scrollbar-width:none]">
      <NavLink to="/admin/opportunities" className={tab}>Opportunities</NavLink>
      <NavLink to="/admin/feedback" className={tab}>Feedback &amp; reviews</NavLink>
    </nav>
  )
}

export function AdminOverviewPage() {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview })
  // Latest platform-wide audit entries (same table and RLS as the Audit log page; small, separate key).
  const recent = useQuery({ queryKey: ['audit', 'all', 'recent'], queryFn: () => getAuditLog(undefined, 5) })
  const d = q.data
  const queue = d ? ([
    [d.organizations_pending, `organization${d.organizations_pending === 1 ? '' : 's'} awaiting verification`, '/admin/organizations', 'shield-check'],
    [d.complaints_open, `open complaint${d.complaints_open === 1 ? '' : 's'}`, '/admin/complaints', 'flag'],
    [d.suspended_users, `suspended user${d.suspended_users === 1 ? '' : 's'}`, '/admin/users', 'users'],
  ] as const) : []
  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Platform administration" subtitle="Live platform statistics. Every action here is enforced and audited by the database." />
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon="users" label="Users" value={d.users} caption={`${d.suspended_users} suspended`} />
            <Stat icon="shield-check" label="Pending verification" value={<Link className="hover:underline" to="/admin/organizations">{d.organizations_pending}</Link>} caption={`${d.organizations_verified} verified`} />
            <Stat icon="flag" label="Open complaints" value={<Link className="hover:underline" to="/admin/complaints">{d.complaints_open}</Link>} caption="awaiting a response" />
            <Stat icon="briefcase" label="Published opportunities" value={d.opportunities_published} caption={`${d.applications_active} active applications`} />
          </div>
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="flex flex-col sm:p-7">
              <h2 className="mb-2 text-xl font-semibold">Your queue</h2>
              {queue.every(([n]) => n === 0) && <p className="border-t border-neutral-100 py-3 text-sm text-ink-500">Nothing waiting. New verifications and complaints appear here.</p>}
              {queue.filter(([n]) => n > 0).map(([n, text, to, icon]) => (
                <Link key={to} to={to} className="flex items-center justify-between gap-3 border-t border-neutral-100 py-3 text-sm hover:text-brand-700">
                  <span className="flex items-center gap-2"><Icon name={icon} size={16} className="text-ink-500" /><strong className="tabular-nums">{n}</strong> {text}</span>
                  <Icon name="chevron-right" size={16} className="text-ink-500" />
                </Link>
              ))}
            </Card>
            <Card className="flex flex-col sm:p-7">
              <h2 className="mb-2 text-xl font-semibold">Platform activity</h2>
              {([
                ['Open offers', d.offers_pending],
                ['Confirmed places', d.signups_confirmed],
                ['Published feedback', d.feedback_published],
                ['Verified hours', Number(d.verified_hours).toLocaleString()],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-t border-neutral-100 py-2 text-sm"><span className="text-ink-700">{k}</span><span className="font-semibold tabular-nums text-ink-900">{v}</span></div>
              ))}
            </Card>
          </div>
        </>
      )}
      <Card className="flex flex-col sm:p-7">
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Recent administrative activity</h2>
          <Link to="/admin/audit" className="text-sm font-semibold text-brand-700 hover:underline">Audit log</Link>
        </div>
        {recent.isPending && <LoadingState label="Loading activity" />}
        {recent.isError && <p className="text-sm text-ink-500">Activity could not be loaded.</p>}
        {recent.data?.length === 0 && <p className="text-sm text-ink-500">No changes recorded yet.</p>}
        {recent.data?.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 py-2.5 text-sm">
            <span className="flex items-center gap-2"><Icon name="list" size={14} className="text-ink-500" /><strong className="font-semibold">{a.action}</strong> · {a.entity_type}</span>
            <span className="text-xs text-ink-500">{formatDateTime(a.occurred_at)}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

/** Private verification data for one organization (platform admins and its members). */
export function OrgVerificationDetails({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ['org-private', orgId], queryFn: () => getOrgPrivate(orgId) })
  if (q.isPending) return <LoadingState label="Loading verification details" />
  if (q.isError) return <p className="text-sm text-rose-700">{toAppError(q.error).message}</p>
  const p = q.data
  if (!p) return <p className="text-sm text-ink-500">No verification details submitted.</p>
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-2">
      <div><dt className="inline text-ink-500">Registration ID: </dt><dd className="inline">{p.registration_id ?? '—'}</dd></div>
      <div><dt className="inline text-ink-500">Address: </dt><dd className="inline">{p.address ?? '—'}</dd></div>
      <div><dt className="inline text-ink-500">Representative: </dt><dd className="inline">{p.representative_name ?? '—'}{p.representative_role ? ` (${p.representative_role})` : ''}</dd></div>
      <div><dt className="inline text-ink-500">Documents: </dt><dd className="inline">{p.verification_docs.length === 0 ? 'none' : p.verification_docs.map((d) => <span key={d} className="mr-2"><DocLink path={d} /></span>)}</dd></div>
    </dl>
  )
}

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const { session } = useAuth()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<Notice>(null)
  const q = useQuery({ queryKey: ['admin-users', query, page], queryFn: () => getAdminUsers(query, page) })
  const susp = useMutation({
    mutationFn: (v: { id: string; suspend: boolean; reason: string | null }) => setSuspension(v.id, v.suspend, v.reason),
    onSuccess: (_r, v) => { setNotice({ tone: 'success', text: v.suspend ? 'User suspended and notified.' : 'Suspension lifted.' }); void qc.invalidateQueries({ queryKey: ['admin-users'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  const total = Number(q.data?.[0]?.total_count ?? 0)
  return (
    <div className="flex min-w-0 flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Users" subtitle="Search accounts, review activity and apply restrictions. Platform admin roles are managed only by the operator, never here." />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-neutral-100 bg-white p-4 shadow-[0_1px_2px_rgba(20,26,34,0.04)]" role="search" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('q') ?? '').trim(); setParams(v ? { q: v } : {}) }}>
        <div className="min-w-0 flex-1"><TextField label="Search name or email" name="q" defaultValue={query} /></div>
        <Button type="submit">Search</Button>
      </form>
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No users found" />}
      {q.data && q.data.length > 0 && (
        <div className={TABLE.wrap}>
          <table className={TABLE.table}>
            <caption className="sr-only">Users</caption>
            <thead className={TABLE.thead}>
              <tr><th scope="col" className={TABLE.th}>User</th><th scope="col" className={TABLE.th}>Location</th><th scope="col" className={TABLE.th}>Activity</th><th scope="col" className={TABLE.th}>Status</th><th scope="col" className={TABLE.th}><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className={TABLE.tbody}>
              {q.data.map((u) => (
                <tr key={u.user_id} className={TABLE.tr}>
                  <td className={TABLE.td}><span className="flex min-w-0 items-center gap-3"><Initials name={u.full_name} size={32} /><span className="min-w-0"><strong className="block text-sm">{u.full_name}</strong><span className="block break-all text-xs text-ink-500">{u.email}</span><span className="block text-xs text-ink-500">joined {formatDateTime(u.created_at)}</span></span></span></td>
                  <td className={`${TABLE.td} ${TABLE.hideSm}`}>{[u.city, u.country_code].filter(Boolean).join(', ') || '—'}</td>
                  <td className={`${TABLE.td} ${TABLE.fullSm} text-xs text-ink-500`}>{u.org_count} org · {u.application_count} applications · {u.signup_count} sign-ups</td>
                  <td className={TABLE.td}>{u.platform_role === 'platform_admin' ? <StatusBadge status="platform admin" /> : u.suspended_at ? <><StatusBadge status="suspended" /><span className="block text-xs text-ink-500">{u.suspended_reason}</span></> : <StatusBadge status="active" />}</td>
                  <td className={`${TABLE.td} ${TABLE.fullSm} md:text-right`}>
                    {u.platform_role !== 'platform_admin' && u.user_id !== session?.user.id && (u.suspended_at ? (
                      <Button size="sm" variant="secondary" busy={susp.isPending && susp.variables?.id === u.user_id} onClick={() => susp.mutate({ id: u.user_id, suspend: false, reason: null })}>Lift suspension</Button>
                    ) : (
                      <Button size="sm" variant="danger" busy={susp.isPending && susp.variables?.id === u.user_id} onClick={async () => {
                        const reason = await dialog.prompt({ title: `Suspend ${u.full_name}?`, label: 'Reason (shown to the user)', confirmLabel: 'Suspend', danger: true })
                        if (reason) susp.mutate({ id: u.user_id, suspend: true, reason })
                      }}>Suspend</Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && q.data.length > 0 && <p className="flex items-start gap-1.5 text-xs text-ink-500"><Icon name="info" size={12} className="mt-0.5" />Admins cannot suspend themselves or other platform admins. Every suspension is written to the audit log.</p>}
      {total > 25 && (
        <nav aria-label="Pagination" className="flex items-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => { params.set('page', String(page - 1)); setParams(params) }}>Previous</Button>
          <span className="text-sm text-ink-500">Page {page} of {Math.ceil(total / 25)}</span>
          <Button variant="secondary" disabled={page * 25 >= total} onClick={() => { params.set('page', String(page + 1)); setParams(params) }}>Next</Button>
        </nav>
      )}
    </div>
  )
}

export function AdminOpportunitiesPage() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const [status, setStatus] = useState<'published' | 'closed'>('published')
  const [notice, setNotice] = useState<Notice>(null)
  const q = useQuery({ queryKey: ['admin-opps', status], queryFn: () => getOpportunitiesForModeration(status) })
  const mod = useMutation({
    mutationFn: (v: { id: string; reason: string }) => moderateOpportunity(v.id, v.reason),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Opportunity closed; the organization was notified with your reason.' }); void qc.invalidateQueries({ queryKey: ['admin-opps'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  return (
    <div className="flex min-w-0 flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Content moderation" subtitle="Close misleading, unsafe or non-compliant listings. Closing is final for the organization." />
      <ModerationNav />
      <Tabs label="Listing status" controls="opp-mod" value={status} onChange={setStatus} tabs={[{ value: 'published', label: 'Published' }, { value: 'closed', label: 'Closed' }]} />
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="Nothing here" />}
      <ul id="opp-mod" role="tabpanel" aria-labelledby={`tab-opp-mod-${status}`} className="flex flex-col gap-3">
        {q.data?.map((o) => (
          <li key={o.id}><Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link className="font-medium hover:underline" to={`/opportunities/${o.id}`}>{o.title}</Link>
              <p className="text-sm text-ink-500">{o.organizations?.name} · {COMPENSATION_LABELS[o.compensation_type]}{o.published_at ? ` · published ${formatDateTime(o.published_at)}` : ''}</p>
              {o.moderation_reason && <p className="text-sm text-rose-800">Moderated: {o.moderation_reason}</p>}
            </div>
            {o.status === 'published' && <Button size="sm" variant="danger" busy={mod.isPending && mod.variables?.id === o.id} onClick={async () => {
              const reason = await dialog.prompt({ title: `Close “${o.title}”?`, label: 'Reason (shown to the organization and on the listing)', confirmLabel: 'Close listing', danger: true })
              if (reason) mod.mutate({ id: o.id, reason })
            }}>Close listing</Button>}
          </Card></li>
        ))}
      </ul>
    </div>
  )
}

const COMPLAINT_NEXT: Record<ComplaintStatus, ComplaintStatus[]> = { open: ['in_review', 'resolved', 'dismissed'], in_review: ['resolved', 'dismissed'], resolved: [], dismissed: [] }

export function AdminComplaintsPage() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const [status, setStatus] = useState<ComplaintStatus | ''>('open')
  const [notice, setNotice] = useState<Notice>(null)
  const q = useQuery({ queryKey: ['admin-complaints', status], queryFn: () => getAllComplaints(status || undefined) })
  const respond = useMutation({
    mutationFn: (v: { id: string; status: ComplaintStatus; response: string | null }) => respondComplaint(v.id, v.status, v.response),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Complaint updated; the reporter was notified.' }); void qc.invalidateQueries({ queryKey: ['admin-complaints'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  return (
    <div className="flex min-w-0 flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Complaints" subtitle="Private reports from volunteers and organizations. Organizations never see complaints about them." />
      <Tabs label="Complaint status" controls="complaints" value={status || 'all'} onChange={(v) => setStatus(v === 'all' ? '' : v)}
        tabs={[{ value: 'open', label: 'Open' }, { value: 'in_review', label: 'In review' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }, { value: 'all', label: 'All' }]} />
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No complaints here" />}
      <ul id="complaints" role="tabpanel" aria-labelledby={`tab-complaints-${status || 'all'}`} className="flex flex-col gap-3">
        {q.data?.map((c) => (
          <li key={c.id}><Card className="sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{c.subject}</h2>
                <p className="text-xs text-ink-500">by {c.reporter?.full_name ?? 'unknown'} · {formatDateTime(c.created_at)}{c.organizations ? ` · about ${c.organizations.name}` : ''}{c.opportunities ? ` · ${c.opportunities.title}` : ''}</p>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{c.description}</p>
            {c.admin_response && <p className="mt-2 rounded-md bg-brand-50 p-2 text-sm"><span className="font-medium">Response:</span> {c.admin_response}</p>}
            {COMPLAINT_NEXT[c.status].length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {COMPLAINT_NEXT[c.status].map((s) => (
                  <Button key={s} size="sm" variant={s === 'dismissed' ? 'secondary' : s === 'resolved' ? 'primary' : 'ghost'} busy={respond.isPending && respond.variables?.id === c.id}
                    onClick={async () => {
                      const needs = s === 'resolved' || s === 'dismissed'
                      const response = await dialog.prompt({ title: `Mark as ${s.replace('_', ' ')}`, label: needs ? 'Response to the reporter (required)' : 'Note to the reporter (optional)', required: needs, confirmLabel: 'Save' })
                      if (response !== null) respond.mutate({ id: c.id, status: s, response: response || null })
                    }}>{s === 'in_review' ? 'Start review' : s === 'resolved' ? 'Resolve' : 'Dismiss'}</Button>
                ))}
              </div>
            )}
          </Card></li>
        ))}
      </ul>
    </div>
  )
}

export function AdminFeedbackPage() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<Notice>(null)
  const q = useQuery({ queryKey: ['admin-feedback'], queryFn: getAllFeedback })
  const mod = useMutation({
    mutationFn: (v: { id: string; status: 'published' | 'hidden'; reason: string | null }) => moderateFeedback(v.id, v.status, v.reason),
    onSuccess: (_r, v) => { setNotice({ tone: 'success', text: v.status === 'hidden' ? 'Feedback hidden from public pages.' : 'Feedback restored.' }); void qc.invalidateQueries({ queryKey: ['admin-feedback'] }) },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  return (
    <div className="flex min-w-0 flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Content moderation" subtitle="Public reviews from verified participants. Hide abusive or off-topic reviews." />
      <ModerationNav />
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No feedback yet" />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((f) => (
          <li key={f.id}><Card className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p aria-label={`${f.rating} out of 5`}>{'★'.repeat(f.rating)}<span className="text-ink-500">{'★'.repeat(5 - f.rating)}</span></p>
              {f.comment && <p className="text-sm text-ink-700">{f.comment}</p>}
              <p className="text-xs text-ink-500">{f.profiles?.full_name} → {f.organizations?.name} · {f.opportunities?.title} · {formatDateTime(f.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={f.status} />
              {f.status === 'published'
                ? <Button size="sm" variant="danger" busy={mod.isPending && mod.variables?.id === f.id} onClick={async () => {
                    const reason = await dialog.prompt({ title: 'Hide this feedback?', label: 'Reason (internal)', confirmLabel: 'Hide', danger: true })
                    if (reason) mod.mutate({ id: f.id, status: 'hidden', reason })
                  }}>Hide</Button>
                : <Button size="sm" variant="secondary" busy={mod.isPending && mod.variables?.id === f.id} onClick={() => mod.mutate({ id: f.id, status: 'published', reason: null })}>Restore</Button>}
            </div>
          </Card></li>
        ))}
      </ul>
    </div>
  )
}
