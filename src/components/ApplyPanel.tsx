import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { APPLICATION_STATUS_LABELS, applyToOpportunity, getMyApplicationFor, withdrawApplication } from '../lib/platform'
import { toAppError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { useDialog } from './dialog'
import { Alert, Button, Card, StatusBadge, TextArea } from './ui'

/** Application entry point for opportunities that select volunteers (selection_mode = application). */
export function ApplyPanel({ opportunityId, deadline, now }: { opportunityId: string; deadline: string | null; now: number }) {
  const { session } = useAuth()
  const location = useLocation()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const uid = session?.user.id
  const mine = useQuery({ queryKey: ['my-application', opportunityId, uid], enabled: !!uid, queryFn: () => getMyApplicationFor(uid!, opportunityId) })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['my-application', opportunityId] }); void qc.invalidateQueries({ queryKey: ['my-applications'] }) }

  const apply = useMutation({
    mutationFn: (message: string | null) => applyToOpportunity(opportunityId, message),
    onSuccess: (r) => { setNotice({ tone: 'success', text: r.replayed ? 'You had already applied — your application is unchanged.' : 'Application sent. You will be notified when the organization decides.' }); refresh() },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })
  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawApplication(id),
    onSuccess: () => { setNotice({ tone: 'info', text: 'Application withdrawn.' }); refresh() },
    onError: (e) => setNotice({ tone: 'error', text: toAppError(e).message }),
  })

  const closed = deadline !== null && new Date(deadline).getTime() <= now
  const active = mine.data && ['submitted', 'under_review', 'selected'].includes(mine.data.status) ? mine.data : null

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const msg = String(new FormData(e.currentTarget).get('message') ?? '').trim()
    if (msg.length > 2000) return setNotice({ tone: 'error', text: 'Your message can be at most 2000 characters.' })
    apply.mutate(msg || null)
  }

  return (
    <Card className="mb-4">
      <h3 className="font-semibold">Apply for this opportunity</h3>
      <p className="mt-1 text-sm text-ink-700">
        The organization reviews applications and sends selected volunteers an offer for a specific shift. Offers must be accepted within 72 hours.
        {deadline && <> Applications close <strong>{formatDateTime(deadline)}</strong>.</>}
      </p>
      <div aria-live="polite" className="mt-3">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {!session ? (
        <Link to={`/signin?next=${encodeURIComponent(location.pathname)}`} className="mt-3 inline-block text-sm text-brand-700 underline">Sign in to apply</Link>
      ) : active ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">Your application:</span>
          <StatusBadge status={active.status} />
          <span className="sr-only">{APPLICATION_STATUS_LABELS[active.status]}</span>
          <Link to="/me/applications" className="text-sm text-brand-700 underline">{active.status === 'selected' ? 'Respond to your offer' : 'Track it'}</Link>
          <Button variant="secondary" busy={withdraw.isPending} onClick={async () => {
            if (await dialog.confirm({ title: 'Withdraw your application?', message: 'Any pending offer will be declined. You can apply again later while applications are open.', confirmLabel: 'Withdraw', danger: true }))
              withdraw.mutate(active.id)
          }}>Withdraw</Button>
        </div>
      ) : closed ? (
        <p className="mt-3 text-sm font-medium text-ink-700">Applications are closed.</p>
      ) : (
        <form className="mt-3 flex flex-col gap-3" onSubmit={onSubmit} noValidate>
          {mine.data && <p className="text-sm text-ink-500">Previous application: {APPLICATION_STATUS_LABELS[mine.data.status]}. You may apply again.</p>}
          <TextArea label="Message to the organization (optional)" name="message" maxLength={2000} hint="Why you are a good fit, relevant experience, availability." />
          <div><Button type="submit" busy={apply.isPending}>Submit application</Button></div>
        </form>
      )}
    </Card>
  )
}
