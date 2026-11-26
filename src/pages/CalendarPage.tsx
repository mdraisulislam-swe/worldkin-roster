import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { getMySignups } from '../lib/api'
import { getMyApplications } from '../lib/platform'
import { MARK_LABEL, dayKey, indexByDay, type CalendarMark } from '../lib/calendarGrid'
import { downloadIcs } from '../lib/calendar'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui'
import { MonthCalendar } from '../components/MonthCalendar'

type Item = { id: string; at: string; end?: string; kind: CalendarMark; title: string; sub: string; to: string; status?: string }

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * Personal calendar: own shifts (confirmed, waitlisted, past) and the deadlines of open offers.
 * Applications without an offer are not events, so they are not shown as dates.
 */
export function CalendarPage() {
  const { session } = useAuth()
  const uid = session!.user.id
  const now = useNow(60_000)
  const signups = useQuery({ queryKey: ['my-signups', uid], queryFn: () => getMySignups(uid) })
  const apps = useQuery({ queryKey: ['my-applications'], queryFn: getMyApplications })
  const todayKey = dayKey(new Date(now))
  const [selected, setSelected] = useState(todayKey)
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })

  const items: Item[] = [
    ...(signups.data ?? []).filter((s) => s.shifts && s.status !== 'cancelled').map((s) => {
      const ended = new Date(s.shifts!.ends_at).getTime() <= now
      return {
        id: s.id, at: s.shifts!.starts_at, end: s.shifts!.ends_at,
        kind: (ended ? 'past' : s.status === 'waitlisted' ? 'waitlisted' : 'confirmed') as CalendarMark,
        title: s.shifts!.title?.trim() || s.shifts!.opportunities?.title || 'Shift',
        sub: s.shifts!.opportunities?.organizations?.name ?? '',
        to: s.shifts!.opportunities?.id ? `/opportunities/${s.shifts!.opportunities.id}` : '/me', status: s.status,
      }
    }),
    ...(apps.data ?? []).filter((a) => a.offer_status === 'pending' && a.offer_expires_at && new Date(a.offer_expires_at).getTime() > now).map((a) => ({
      id: 'offer-' + a.application_id, at: a.offer_expires_at!, kind: 'deadline' as CalendarMark,
      title: `Answer your offer: ${a.opportunity_title}`, sub: a.org_name, to: '/me/applications',
    })),
  ]
  const byDay = indexByDay(items, (i) => i.at)
  const marks = new Map([...byDay].map(([k, v]) => [k, v.map((i) => i.kind)]))
  const dayItems = (byDay.get(selected) ?? []).sort((a, b) => a.at.localeCompare(b.at))
  const next = items.filter((i) => i.kind !== 'past' && new Date(i.at).getTime() > now).sort((a, b) => a.at.localeCompare(b.at))[0]
  const selDate = new Date(selected + 'T00:00:00')

  return (
    <>
      <PageHeader title="My calendar" subtitle="Your confirmed and waitlisted shifts, past participation and offer deadlines." />
      {(signups.isPending || apps.isPending) && <LoadingState label="Loading your calendar" />}
      {signups.isError && <ErrorState message={toAppError(signups.error).message} onRetry={() => signups.refetch()} />}
      {signups.data && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <MonthCalendar month={month} marks={marks} selected={selected} today={todayKey}
              onSelect={setSelected} onMonth={(d) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + d, 1))} />
            {apps.isError && <p className="mt-2 text-sm text-ink-500">Offer deadlines could not be loaded; shifts are shown.</p>}
          </div>
          <section aria-labelledby="day-h" className="lg:col-span-2">
            <h2 id="day-h" className="mb-3 text-lg font-semibold" aria-live="polite">
              {selected === todayKey ? 'Today' : selDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            {dayItems.length === 0 ? (
              <EmptyState title="Nothing on this day">
                {next ? <>Next: <button type="button" className="text-brand-700 underline" onClick={() => { const d = new Date(next.at); setSelected(dayKey(d)); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>{next.title}</button></>
                  : <Link className="text-brand-700 underline" to="/events">Find an event</Link>}
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {dayItems.map((i) => (
                  <li key={i.id}>
                    <Card className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm tabular-nums text-ink-500">{i.kind === 'deadline' ? `Expires ${timeFmt.format(new Date(i.at))}` : `${timeFmt.format(new Date(i.at))}${i.end ? ` – ${timeFmt.format(new Date(i.end))}` : ''}`}</p>
                          <Link to={i.to} className="font-medium hover:underline">{i.title}</Link>
                          {i.sub && <p className="text-sm text-ink-500">{i.sub}</p>}
                        </div>
                        {i.status ? <StatusBadge status={i.status} /> : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900">{MARK_LABEL.deadline}</span>}
                      </div>
                      {(i.kind === 'confirmed' || i.kind === 'waitlisted') && i.end && (
                        <Button variant="ghost" className="self-start" onClick={() => downloadIcs({ uid: i.id, title: i.title, startsAt: i.at, endsAt: i.end!, description: i.sub })}>Add to calendar</Button>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  )
}
