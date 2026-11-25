import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { getOrganizationsForReview, reviewOrganization } from '../lib/api'
import type { Enums } from '../lib/database.types'
import { toAppError } from '../lib/errors'
import { CAUSE_LABELS, formatDateTime } from '../lib/format'
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select, StatusBadge } from '../components/ui'
import { useDialog } from '../components/dialog'
import { AdminNav, OrgVerificationDetails } from './AdminPlatformPages'

type Decision = Enums<'org_status'>
/** Mirrors the database state machine (review_organization). */
const ACTIONS: Record<Decision, { to: Decision; label: string; variant: 'primary' | 'danger' | 'secondary'; reason: boolean }[]> = {
  pending: [
    { to: 'verified', label: 'Verify', variant: 'primary', reason: false },
    { to: 'rejected', label: 'Reject', variant: 'danger', reason: true },
  ],
  verified: [{ to: 'suspended', label: 'Suspend', variant: 'danger', reason: true }],
  suspended: [{ to: 'verified', label: 'Reinstate', variant: 'primary', reason: false }],
  rejected: [],
}

export function AdminPage() {
  const { memberships } = useAuth()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [filter, setFilter] = useState<Decision | ''>('pending')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const orgs = useQuery({ queryKey: ['admin-orgs', filter], queryFn: () => getOrganizationsForReview(filter || undefined) })
  const review = useMutation({
    mutationFn: (v: { orgId: string; decision: Decision; reason?: string }) => reviewOrganization(v.orgId, v.decision, v.reason),
    onSuccess: (_r, v) => { setNotice({ tone: 'success', text: `Organization ${v.decision}.` }); void qc.invalidateQueries({ queryKey: ['admin-orgs'] }) },
    onError: (err) => setNotice({ tone: 'error', text: toAppError(err).message }),
  })
  const memberOf = new Set(memberships.map((m) => m.org_id))

  return (
    <>
      <PageHeader title="Organization verification" subtitle="Review registration details and documents before an organization can publish opportunities." />
      <AdminNav />
      <div className="mb-4 max-w-xs">
        <Select label="Show" value={filter} onChange={(e) => setFilter(e.currentTarget.value as Decision | '')}
          options={[{ value: 'pending', label: 'Pending review' }, { value: 'verified', label: 'Verified' }, { value: 'suspended', label: 'Suspended' }, { value: 'rejected', label: 'Rejected' }, { value: '', label: 'All' }]} />
      </div>
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      {orgs.isPending && <LoadingState />}
      {orgs.isError && <ErrorState message={toAppError(orgs.error).message} onRetry={() => orgs.refetch()} />}
      {orgs.data?.length === 0 && <EmptyState title="Nothing to review here" />}
      <ul className="flex flex-col gap-3">
        {orgs.data?.map((o) => (
          <li key={o.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.name} <span className="text-sm font-normal text-ink-500">/{o.slug}</span></p>
                  <p className="text-sm text-ink-500">{CAUSE_LABELS[o.cause]} · {o.country_code} · registered {formatDateTime(o.created_at)}</p>
                  {o.website && <p className="text-sm"><a className="text-brand-700 underline" href={o.website} target="_blank" rel="noreferrer noopener">{o.website}</a></p>}
                  {o.description && <p className="mt-2 max-w-2xl text-sm text-ink-700">{o.description}</p>}
                  {o.status_reason && <p className="mt-2 text-sm text-ink-500">Reason: {o.status_reason}</p>}
                  <details className="mt-2"><summary className="cursor-pointer text-sm text-brand-700">Verification details &amp; documents</summary><div className="mt-2"><OrgVerificationDetails orgId={o.id} /></div></details>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {memberOf.has(o.id) ? (
                  <p className="text-sm text-amber-800">You are a member of this organization; another admin must review it.</p>
                ) : (
                  ACTIONS[o.status].map((a) => (
                    <Button key={a.to} variant={a.variant} busy={review.isPending && review.variables?.orgId === o.id}
                      onClick={async () => {
                        let reason: string | undefined
                        if (a.reason) {
                          const r = await dialog.prompt({ title: `${a.label} ${o.name}?`, label: 'Reason (visible to its admins)', confirmLabel: a.label, danger: a.variant === 'danger' })
                          if (!r) return
                          reason = r
                        } else if (!(await dialog.confirm({ title: `${a.label} ${o.name}?`, confirmLabel: a.label }))) return
                        review.mutate({ orgId: o.id, decision: a.to, reason })
                      }}>
                      {a.label}
                    </Button>
                  ))
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
