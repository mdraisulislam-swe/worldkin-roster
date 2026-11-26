import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { AdminNav } from './AdminPlatformPages'
import { getAuditLog } from '../lib/api'
import { toAppError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui'

/**
 * Append-only audit trail. Org admins see their organization's entries
 * (/org/:orgId/audit); platform admins see everything (/admin/audit).
 * Visibility is enforced by RLS — this page only renders what the DB returns.
 */
export function AuditPage() {
  const { orgId } = useParams()
  const q = useQuery({ queryKey: ['audit', orgId ?? 'all'], queryFn: () => getAuditLog(orgId) })
  return (
    <>
      <PageHeader title="Audit log" subtitle={orgId ? 'Every change to this organization’s data, with who made it.' : 'Platform-wide change history.'} />
      {!orgId && <AdminNav />}
      <p className="mb-4 text-sm text-ink-500">Latest 100 changes. Entries cannot be edited or deleted. "operator" means a change made directly by the platform owner.</p>
      {q.isPending && <LoadingState />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="No audit entries yet" />}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-100 bg-white shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Audit log entries</caption>
            <thead className="border-b border-neutral-100 bg-surface text-xs uppercase tracking-wide text-ink-500">
              <tr><th scope="col" className="px-3 py-2">When</th><th scope="col" className="px-3 py-2">Action</th><th scope="col" className="px-3 py-2">Entity</th><th scope="col" className="px-3 py-2">Actor</th><th scope="col" className="px-3 py-2">Details</th></tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id} className="border-t border-black/5 align-top">
                  <td className="whitespace-nowrap px-3 py-2">{formatDateTime(a.occurred_at)}</td>
                  <td className="px-3 py-2">{a.action}</td>
                  <td className="px-3 py-2">{a.entity_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.actor_id ? a.actor_id.slice(0, 8) : 'operator'}</td>
                  <td className="max-w-md px-3 py-2"><code className="block truncate text-xs" title={JSON.stringify(a.details)}>{JSON.stringify(a.details)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
