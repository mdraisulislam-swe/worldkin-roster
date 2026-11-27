import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { getInvites, getMembers, inviteMember, removeMember, revokeInvite } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { formatDateTime } from '../lib/format'
import { fieldErrors, inviteSchema } from '../lib/validation'
import { Alert, Button, Card, ErrorState, LoadingState, PageHeader, Select, StatusBadge, TextField } from '../components/ui'
import { useDialog } from '../components/dialog'

/**
 * Team management (org admins). Invites are consent-based: the response never
 * reveals whether an email is registered; the person joins only by accepting.
 */
export function OrgTeamPage() {
  const { orgId = '' } = useParams()
  const { session } = useAuth()
  const now = useNow()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => getMembers(orgId) })
  const invites = useQuery({ queryKey: ['invites', orgId], queryFn: () => getInvites(orgId) })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['members', orgId] }); void qc.invalidateQueries({ queryKey: ['invites', orgId] }) }
  const fail = (err: unknown) => setNotice({ tone: 'error', text: toAppError(err).message })

  const invite = useMutation({
    mutationFn: (v: { email: string; role: 'org_admin' | 'coordinator' }) => inviteMember(orgId, v.email, v.role),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Invite recorded. The person will see it after signing in with this email and can accept it.' }); refresh() },
    onError: fail,
  })
  const revoke = useMutation({ mutationFn: revokeInvite, onSuccess: () => { setNotice({ tone: 'success', text: 'Invite revoked.' }); refresh() }, onError: fail })
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(orgId, userId),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Member removed.' }); refresh() },
    onError: fail,
  })

  function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const parsed = inviteSchema.safeParse(Object.fromEntries(new FormData(form)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setNotice(null)
    invite.mutate(parsed.data, { onSuccess: () => form.reset() })
  }

  return (
    <>
      <PageHeader title="Team" subtitle="Organization admins and coordinators. New staff join by accepting an email invite." />
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="mem-h">
          <h2 id="mem-h" className="mb-3 text-lg font-semibold">Members</h2>
          {members.isPending && <LoadingState />}
          {members.isError && <ErrorState message={toAppError(members.error).message} onRetry={() => members.refetch()} />}
          <ul className="flex flex-col gap-2">
            {members.data?.map((m) => (
              <li key={m.user_id}>
                <Card className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{m.profiles?.full_name ?? 'Member'}{m.user_id === session?.user.id ? ' (you)' : ''}</p>
                    <p className="text-sm text-ink-500">{m.role === 'org_admin' ? 'Organization admin' : 'Coordinator'}</p>
                  </div>
                  <Button variant="secondary" busy={remove.isPending && remove.variables === m.user_id}
                    onClick={async () => { if (await dialog.confirm({ title: `Remove ${m.profiles?.full_name ?? 'this member'}?`, message: 'They lose access to this organization immediately. The last admin cannot be removed.', confirmLabel: 'Remove', danger: true })) remove.mutate(m.user_id) }}>
                    Remove
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="inv-h">
          <h2 id="inv-h" className="mb-3 text-lg font-semibold">Invite staff</h2>
          <Card className="mb-4">
            <form className="flex flex-col gap-3" onSubmit={onInvite} noValidate>
              <TextField label="Email" name="email" type="email" error={errors.email} />
              <Select label="Role" name="role" defaultValue="coordinator"
                options={[{ value: 'coordinator', label: 'Coordinator' }, { value: 'org_admin', label: 'Organization admin' }]} />
              <div><Button type="submit" busy={invite.isPending}>Send invite</Button></div>
            </form>
          </Card>
          {invites.data && invites.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {invites.data.map((i) => {
                const state = i.accepted_at ? 'accepted' : i.revoked_at ? 'revoked' : new Date(i.expires_at).getTime() < now ? 'expired' : 'pending'
                return (
                  <li key={i.id}>
                    <Card className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{i.email}</p>
                        <p className="text-xs text-ink-500">{i.role === 'org_admin' ? 'Organization admin' : 'Coordinator'} · expires {formatDateTime(i.expires_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={state} />
                        {state === 'pending' && <Button variant="secondary" busy={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>Revoke</Button>}
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
