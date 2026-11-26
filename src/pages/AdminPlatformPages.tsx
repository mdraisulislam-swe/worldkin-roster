import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import {
  COMPENSATION_LABELS, getAdminOverview, getAdminUsers, getAllComplaints, getAllFeedback, getOpportunitiesForModeration, getOrgPrivate,
  moderateFeedback, moderateOpportunity, respondComplaint, setSuspension, type ComplaintStatus,
} from '../lib/platform'
import { toAppError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { useDialog } from '../components/dialog'
import { DashboardNav } from '../components/DashboardNav'
import { DocLink } from './OrgPlatformPages'
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select, Stat, StatusBadge, TextField } from '../components/ui'

export function AdminNav() {
  return <DashboardNav label="Platform administration" items={[
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/organizations', label: 'Organization verification' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/opportunities', label: 'Opportunity moderation' },
    { to: '/admin/complaints', label: 'Complaints' },
    { to: '/admin/feedback', label: 'Feedback' },
    { to: '/admin/audit', label: 'Audit log' },
  ]} />
}

type Notice = { tone: 'success' | 'error'; text: string } | null

export function AdminOverviewPage() {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview })
  return (
    <>
      <PageHeader title="Platform administration" subtitle="Live platform statistics. Every action here is enforced and audited by the database." />
      <AdminNav />
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Users" value={q.data.users} />
          <Stat label="Suspended users" value={q.data.suspended_users} />
          <Stat label="Organizations pending" value={<Link className="underline" to="/admin/organizations">{q.data.organizations_pending}</Link>} />
          <Stat label="Verified organizations" value={q.data.organizations_verified} />
          <Stat label="Published opportunities" value={q.data.opportunities_published} />
          <Stat label="Active applications" value={q.data.applications_active} />
          <Stat label="Open offers" value={q.data.offers_pending} />
          <Stat label="Confirmed places" value={q.data.signups_confirmed} />
          <Stat label="Open complaints" value={<Link className="underline" to="/admin/complaints">{q.data.complaints_open}</Link>} />
          <Stat label="Published feedback" value={q.data.feedback_published} />
          <Stat label="Verified hours" value={Number(q.data.verified_hours).toLocaleString()} />
        </div>
      )}
    </>
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
    <>
      <PageHeader title="Users" subtitle="Volunteers and organization staff. Platform admin roles are managed only by the operator, never here." />
      <AdminNav />
      <form className="mb-4 flex max-w-lg items-end gap-2" role="search" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('q') ?? '').trim(); setParams(v ? { q: v } : {}) }}>
        <div className="flex-1"><TextField label="Search name or email" name="q" defaultValue={query} /></div>
        <Button type="submit">Search</Button>
      </form>
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No users found" />}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-100 bg-white shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Users</caption>
            <thead className="border-b border-neutral-100 bg-surface text-xs uppercase tracking-wide text-ink-500">
              <tr><th scope="col" className="p-2">User</th><th scope="col" className="p-2">Location</th><th scope="col" className="p-2">Activity</th><th scope="col" className="p-2">Status</th><th scope="col" className="p-2"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <tr key={u.user_id} className="border-b border-black/5 align-top">
                  <td className="p-2"><span className="font-medium">{u.full_name}</span><span className="block text-xs text-ink-500">{u.email}</span><span className="block text-xs text-ink-500">joined {formatDateTime(u.created_at)}</span></td>
                  <td className="p-2">{[u.city, u.country_code].filter(Boolean).join(', ') || '—'}</td>
                  <td className="p-2 text-xs">{u.org_count} org · {u.application_count} applications · {u.signup_count} sign-ups</td>
                  <td className="p-2">{u.platform_role === 'platform_admin' ? <StatusBadge status="platform admin" /> : u.suspended_at ? <><StatusBadge status="suspended" /><span className="block text-xs text-ink-500">{u.suspended_reason}</span></> : <StatusBadge status="active" />}</td>
                  <td className="p-2 text-right">
                    {u.platform_role !== 'platform_admin' && u.user_id !== session?.user.id && (u.suspended_at ? (
                      <Button variant="secondary" busy={susp.isPending && susp.variables?.id === u.user_id} onClick={() => susp.mutate({ id: u.user_id, suspend: false, reason: null })}>Lift suspension</Button>
                    ) : (
                      <Button variant="danger" busy={susp.isPending && susp.variables?.id === u.user_id} onClick={async () => {
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
      {total > 25 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => { params.set('page', String(page - 1)); setParams(params) }}>Previous</Button>
          <span className="text-sm text-ink-500">Page {page} of {Math.ceil(total / 25)}</span>
          <Button variant="secondary" disabled={page * 25 >= total} onClick={() => { params.set('page', String(page + 1)); setParams(params) }}>Next</Button>
        </nav>
      )}
    </>
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
    <>
      <PageHeader title="Opportunity moderation" subtitle="Close misleading, unsafe or non-compliant listings. Closing is final for the organization." />
      <AdminNav />
      <div className="mb-4 max-w-xs"><Select label="Show" value={status} onChange={(e) => setStatus(e.currentTarget.value as 'published' | 'closed')} options={[{ value: 'published', label: 'Published' }, { value: 'closed', label: 'Closed' }]} /></div>
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="Nothing here" />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((o) => (
          <li key={o.id}><Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link className="font-medium hover:underline" to={`/opportunities/${o.id}`}>{o.title}</Link>
              <p className="text-sm text-ink-500">{o.organizations?.name} · {COMPENSATION_LABELS[o.compensation_type]}{o.published_at ? ` · published ${formatDateTime(o.published_at)}` : ''}</p>
              {o.moderation_reason && <p className="text-sm text-rose-800">Moderated: {o.moderation_reason}</p>}
            </div>
            {o.status === 'published' && <Button variant="danger" busy={mod.isPending && mod.variables?.id === o.id} onClick={async () => {
              const reason = await dialog.prompt({ title: `Close “${o.title}”?`, label: 'Reason (shown to the organization and on the listing)', confirmLabel: 'Close listing', danger: true })
              if (reason) mod.mutate({ id: o.id, reason })
            }}>Close listing</Button>}
          </Card></li>
        ))}
      </ul>
    </>
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
    <>
      <PageHeader title="Complaints" subtitle="Private reports from volunteers and organizations. Organizations never see complaints about them." />
      <AdminNav />
      <div className="mb-4 max-w-xs"><Select label="Show" value={status} onChange={(e) => setStatus(e.currentTarget.value as ComplaintStatus | '')}
        options={[{ value: 'open', label: 'Open' }, { value: 'in_review', label: 'In review' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }, { value: '', label: 'All' }]} /></div>
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState title="No complaints here" />}
      <ul className="flex flex-col gap-3">
        {q.data?.map((c) => (
          <li key={c.id}><Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{c.subject}</p>
                <p className="text-xs text-ink-500">by {c.reporter?.full_name ?? 'unknown'} · {formatDateTime(c.created_at)}{c.organizations ? ` · about ${c.organizations.name}` : ''}{c.opportunities ? ` · ${c.opportunities.title}` : ''}</p>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{c.description}</p>
            {c.admin_response && <p className="mt-2 rounded-md bg-brand-50 p-2 text-sm"><span className="font-medium">Response:</span> {c.admin_response}</p>}
            {COMPLAINT_NEXT[c.status].length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {COMPLAINT_NEXT[c.status].map((s) => (
                  <Button key={s} variant={s === 'dismissed' ? 'secondary' : s === 'resolved' ? 'primary' : 'ghost'} busy={respond.isPending && respond.variables?.id === c.id}
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
    </>
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
    <>
      <PageHeader title="Feedback moderation" subtitle="Public reviews from verified participants. Hide abusive or off-topic reviews." />
      <AdminNav />
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
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
                ? <Button variant="danger" busy={mod.isPending && mod.variables?.id === f.id} onClick={async () => {
                    const reason = await dialog.prompt({ title: 'Hide this feedback?', label: 'Reason (internal)', confirmLabel: 'Hide', danger: true })
                    if (reason) mod.mutate({ id: f.id, status: 'hidden', reason })
                  }}>Hide</Button>
                : <Button variant="secondary" busy={mod.isPending && mod.variables?.id === f.id} onClick={() => mod.mutate({ id: f.id, status: 'published', reason: null })}>Restore</Button>}
            </div>
          </Card></li>
        ))}
      </ul>
    </>
  )
}
