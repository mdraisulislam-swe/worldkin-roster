import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { cancelShift, cancelSignup, getRoster, getShift, recordAttendance, updateCapacity } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { formatDateTime, formatShiftWindow, shiftHours } from '../lib/format'
import { Alert, Button, CapacityMeter, Card, EmptyState, ErrorState, Initials, LoadingState, PageHeader, StatusBadge, TextField } from '../components/ui'
import { TABLE } from '../lib/table'
import { Icon } from '../components/Icon'
import { useDialog } from '../components/dialog'

/**
 * Coordinator view of one shift: roster (minimal PII), capacity changes
 * (A05: never below confirmed; increases promote the waitlist atomically),
 * staff cancellation with reason, shift cancellation, and attendance
 * (A03: never your own signup; once only; hours bounded by shift length).
 */
export function ShiftManagePage() {
  const { orgId = '', shiftId = '' } = useParams()
  const { session } = useAuth()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [capacity, setCapacity] = useState('')
  const now = useNow()

  const shift = useQuery({ queryKey: ['shift', shiftId], queryFn: () => getShift(shiftId) })
  const roster = useQuery({ queryKey: ['roster', shiftId], queryFn: () => getRoster(shiftId) })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['shift', shiftId] })
    void qc.invalidateQueries({ queryKey: ['roster', shiftId] })
    void qc.invalidateQueries({ queryKey: ['org-dashboard', orgId] })
  }
  const fail = (err: unknown) => setNotice({ tone: 'error', text: toAppError(err).message })

  const cap = useMutation({
    mutationFn: (n: number) => updateCapacity(shiftId, n),
    onSuccess: (r) => {
      setNotice({ tone: 'success', text: `Capacity set to ${r.capacity}.${r.promoted_signup_ids.length ? ` ${r.promoted_signup_ids.length} volunteer(s) promoted from the waitlist.` : ''}` })
      setCapacity(''); refresh()
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelSignup(id, reason),
    onSuccess: (r) => { setNotice({ tone: 'success', text: `Volunteer removed.${r.promoted_signup_ids.length ? ' The next person on the waitlist was promoted.' : ''}` }); refresh() },
    onError: fail,
  })
  const cancelAll = useMutation({
    mutationFn: (reason: string) => cancelShift(shiftId, reason),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Shift cancelled; all places were released.' }); refresh() },
    onError: fail,
  })
  const attend = useMutation({
    mutationFn: (v: { id: string; attended: boolean; hours?: number }) => recordAttendance(v.id, v.attended, v.hours),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Attendance recorded.' }); refresh() },
    onError: fail,
  })

  if (shift.isPending) return <LoadingState />
  if (shift.isError) return <ErrorState message={toAppError(shift.error).message} onRetry={() => shift.refetch()} />
  const s = shift.data
  const started = new Date(s.starts_at).getTime() <= now
  const maxHours = shiftHours(s.starts_at, s.ends_at)
  const rows = roster.data ?? []
  const confirmed = rows.filter((r) => r.status === 'confirmed').length
  const waitlisted = rows.filter((r) => r.status === 'waitlisted').length

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader
        title={s.title ?? 'Shift'}
        subtitle={<><Link className="text-brand-700 underline" to={`/org/${orgId}/opportunities/${s.opportunity_id}`}>{s.opportunities?.title}</Link> · {formatShiftWindow(s.starts_at, s.ends_at)}</>}
        actions={<StatusBadge status={s.status} />}
      />
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card className="sm:p-7">
          <h2 className="mb-2 text-xl font-semibold">Capacity</h2>
          <CapacityMeter confirmed={confirmed} capacity={s.capacity} waitlisted={waitlisted} />
          <p className="mt-1 text-xs text-ink-500">Waitlist limit: {s.waitlist_limit}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500"><Icon name="info" size={12} className="mt-0.5" />When a confirmed volunteer cancels, the first waitlisted person is promoted automatically.</p>
          {s.status === 'scheduled' && !started && (
            <form className="mt-3 flex items-end gap-2" onSubmit={(e) => {
              e.preventDefault()
              const n = Number(capacity)
              if (!Number.isInteger(n) || n < 1 || n > 500) return setNotice({ tone: 'error', text: 'Capacity must be a whole number from 1 to 500.' })
              cap.mutate(n)
            }}>
              <TextField label="New capacity" type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.currentTarget.value)} />
              <Button type="submit" busy={cap.isPending}>Update</Button>
            </form>
          )}
        </Card>
        {s.status === 'scheduled' && !started && (
          <Card className="sm:p-7">
            <h2 className="mb-2 text-xl font-semibold">Cancel shift</h2>
            <p className="text-sm text-ink-500">Releases every confirmed and waitlisted place. This cannot be undone.</p>
            <Button className="mt-3" variant="danger" busy={cancelAll.isPending} onClick={() => {
              void dialog.prompt({ title: 'Cancel this shift?', message: 'Every confirmed and waitlisted place is released. This cannot be undone.', label: 'Reason (shared with volunteers)', confirmLabel: 'Cancel shift', danger: true })
                .then((reason) => { if (reason) cancelAll.mutate(reason) })
            }}>Cancel shift</Button>
          </Card>
        )}
        {s.status === 'cancelled' && <Alert tone="warning">Cancelled{s.cancelled_reason ? `: ${s.cancelled_reason}` : ''}.</Alert>}
      </div>

      <section aria-labelledby="roster-h" className="flex flex-col gap-3">
        <div>
          <h2 id="roster-h" className="text-xl font-semibold">Roster &amp; attendance</h2>
          <p className="text-sm text-ink-500">Record who attended and verify their hours. Volunteers cannot record their own.</p>
        </div>
        {roster.isPending && <LoadingState label="Loading roster" />}
        {roster.isError && <ErrorState message={toAppError(roster.error).message} onRetry={() => roster.refetch()} />}
        {roster.data?.length === 0 && <EmptyState title="Nobody has signed up yet" />}
        {rows.length > 0 && (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <caption className="sr-only">Volunteers on this shift</caption>
              <thead className={TABLE.thead}>
                <tr><th scope="col" className={TABLE.th}>Volunteer</th><th scope="col" className={TABLE.th}>Skills</th><th scope="col" className={TABLE.th}>Status</th><th scope="col" className={TABLE.th}>Joined</th><th scope="col" className={TABLE.th}>Record</th></tr>
              </thead>
              <tbody className={TABLE.tbody}>
                {rows.map((r) => {
                  const self = r.volunteer_id === session?.user.id
                  return (
                    <tr key={r.signup_id} className={TABLE.tr}>
                      <td className={TABLE.td}>
                        <span className="flex items-center gap-3"><Initials name={r.full_name} size={32} />
                          <strong className="text-sm">{r.full_name}{self && <span className="ml-1 text-xs font-normal text-ink-500">(you)</span>}</strong></span>
                      </td>
                      <td className={`${TABLE.td} ${TABLE.hideSm} text-ink-500`}>{r.skills.join(', ') || '—'}</td>
                      <td className={TABLE.td}>
                        <StatusBadge status={r.status} />
                        {r.waitlist_position && <span className="ml-1 text-xs text-ink-500">#{r.waitlist_position}</span>}
                        {r.hours !== null && <span className="ml-1 text-xs text-ink-500">{Number(r.hours)}h</span>}
                      </td>
                      <td className={`${TABLE.td} ${TABLE.hideSm} whitespace-nowrap text-ink-500`}>{formatDateTime(r.joined_at)}</td>
                      <td className={`${TABLE.td} ${TABLE.fullSm}`}>
                        <div className="flex flex-wrap gap-2">
                          {!started && (r.status === 'confirmed' || r.status === 'waitlisted') && (
                            <Button size="sm" variant="secondary" busy={remove.isPending && remove.variables?.id === r.signup_id} onClick={() => {
                              void dialog.prompt({ title: `Remove ${r.full_name}?`, message: 'Their seat goes to the first person on the waitlist.', label: 'Reason', confirmLabel: 'Remove', danger: true })
                                .then((reason) => { if (reason) remove.mutate({ id: r.signup_id, reason }) })
                            }}>Remove</Button>
                          )}
                          {started && r.status === 'confirmed' && !self && (
                            <>
                              <Button size="sm" busy={attend.isPending && attend.variables?.id === r.signup_id} onClick={() => {
                                void dialog.prompt({
                                  title: `Confirm attendance for ${r.full_name}`, message: 'Attendance cannot be changed after saving.', label: `Verified hours (max ${maxHours})`,
                                  inputType: 'number', defaultValue: String(maxHours), confirmLabel: 'Save attendance',
                                  validate: (v) => (Number(v) > 0 && Number(v) <= maxHours ? null : `Hours must be more than 0 and at most ${maxHours}.`),
                                }).then((raw) => { if (raw !== null) attend.mutate({ id: r.signup_id, attended: true, hours: Number(raw) }) })
                              }}><Icon name="check" size={16} />Present</Button>
                              <Button size="sm" variant="secondary" onClick={async () => { if (await dialog.confirm({ title: `Mark ${r.full_name} as no-show?`, message: 'This cannot be changed.', confirmLabel: 'Mark no-show', danger: true })) attend.mutate({ id: r.signup_id, attended: false }) }}>No-show</Button>
                            </>
                          )}
                          {started && r.status === 'confirmed' && self && <span className="text-xs text-ink-500">Another staff member must verify you</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Icon name="info" size={18} /><span>Each attendance record is final and written to the audit log. Disputing a no-show is planned (not active yet).</span>
        </div>
      </section>
    </div>
  )
}
