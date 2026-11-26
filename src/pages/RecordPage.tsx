import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { getMyImpact, getMyRecord } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, formatDateTime } from '../lib/format'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Stat } from '../components/ui'
import { Icon } from '../components/Icon'
import { ParticipationSection } from './VolunteerPages'
import { summarizeExperience, type RecordRow } from '../lib/dashboard'
import { hoursByMonth } from '../lib/calendarGrid'
import { HoursChart } from '../components/HoursChart'
import { COMPENSATION_LABELS, type CompensationType } from '../lib/platform'

const dateOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Printable "verified volunteer record": every entry was verified by
 * organization staff (never self-reported; records are append-only in the DB).
 */
export function RecordPage() {
  const { session, profile } = useAuth()
  const uid = session!.user.id
  const now = useNow()
  const records = useQuery({ queryKey: ['my-record', uid], queryFn: () => getMyRecord(uid) })
  const impact = useQuery({ queryKey: ['my-impact', uid], queryFn: getMyImpact })

  if (records.isPending || impact.isPending) return <LoadingState label="Loading your record" />
  if (records.isError) return <ErrorState message={toAppError(records.error).message} onRetry={() => records.refetch()} />
  const rows = records.data ?? []
  const experience = summarizeExperience(rows as unknown as RecordRow[])
  const p = profile as (typeof profile & { skills?: string[]; languages?: string[] }) | null
  const declared = [...(p?.skills ?? []), ...(p?.languages ?? [])]

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Verified experience passport"
        subtitle={<>{profile?.full_name ? <strong className="font-semibold text-ink-700">{profile.full_name}</strong> : null}{profile?.full_name ? ' · ' : ''}Hours and participation confirmed by organization staff — never self-reported. Generated {formatDateTime(new Date(now).toISOString())}.</>}
        actions={<span className="print:hidden"><Button variant="secondary" onClick={() => window.print()}><Icon name="file-text" size={18} />Print / save as PDF</Button></span>} />
      {impact.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon="award" label="Verified hours" value={Number(impact.data.verified_hours)} caption="all time" />
          <Stat icon="check-circle" label="Sessions attended" value={impact.data.shifts_attended} caption="verified" />
          <Stat icon="building" label="Organizations" value={impact.data.organizations_helped} caption="verified" />
          <Stat icon="file-text" label="Certificates" value={rows.length} caption="one per verified session" />
        </div>
      )}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="sm:p-7 print:hidden">
          {/* HoursChart renders its own "Verified hours per month" heading and table alternative. */}
          {rows.length > 0
            ? <HoursChart data={hoursByMonth(rows.map((r) => ({ hours: r.hours, when: r.shifts?.starts_at ?? r.verified_at })), now, 6)} />
            : <><h2 className="mb-3 text-xl font-semibold">Verified hours per month</h2><p className="text-sm text-ink-500">The chart fills in after an organization confirms your first hours.</p></>}
        </Card>
        <Card className="flex flex-col gap-3 sm:p-7">
          <h2 id="skills-h" className="text-xl font-semibold">Skills &amp; languages</h2>
          <p className="text-xs text-ink-500">Self-declared on your profile — not verified by organizations.</p>
          {declared.length > 0
            ? <ul className="flex flex-wrap gap-2">{declared.map((d, i) => <li key={d + i} className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-ink-700">{d}</li>)}</ul>
            : <p className="text-sm text-ink-500">None added yet.</p>}
        </Card>
      </div>
      {experience.length > 0 && (
        <section aria-labelledby="exp-h">
          <h2 id="exp-h" className="mb-3 text-xl font-semibold">Experience</h2>
          <ul className="flex flex-col gap-3">
            {experience.map((e) => (
              <li key={e.org + e.title} className="rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(20,26,34,0.04)] print:break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">{e.title}</p>
                    <p className="text-sm text-ink-700">{e.org} <span className="text-xs text-emerald-800">· organization-verified</span></p>
                  </div>
                  <p className="text-right text-sm"><span className="font-display text-xl font-bold text-ink-900">{e.hours}</span> verified h</p>
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  {e.compensation ? COMPENSATION_LABELS[e.compensation as CompensationType] ?? e.compensation : 'Type not listed'}
                  {e.cause ? ` · ${CAUSE_LABELS[e.cause as keyof typeof CAUSE_LABELS] ?? e.cause}` : ''}
                  {' · '}{dateOnly.format(new Date(e.first))}{e.first.slice(0, 10) !== e.last.slice(0, 10) ? ` – ${dateOnly.format(new Date(e.last))}` : ''}
                  {' · '}{e.sessions} verified session{e.sessions === 1 ? '' : 's'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="sessions-h">
      <h2 id="sessions-h" className="mb-3 text-xl font-semibold">Verified sessions</h2>
      {rows.length === 0 ? (
        <EmptyState title="No verified hours yet">Hours appear here after an organization confirms your attendance.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-100 bg-white shadow-[0_1px_2px_rgba(20,26,34,0.04)] print:border-0 print:shadow-none">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Verified participation</caption>
          <thead className="border-b border-neutral-100 bg-surface text-xs uppercase tracking-wide text-ink-500">
            <tr><th scope="col" className="px-4 py-2.5">Date</th><th scope="col" className="px-4 py-2.5">Opportunity</th><th scope="col" className="px-4 py-2.5">Organization</th><th scope="col" className="px-4 py-2.5 text-right">Hours</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 align-top">
                <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(r.shifts?.starts_at ?? r.verified_at)}</td>
                <td className="px-4 py-2.5">
                  {r.shifts?.opportunities?.title ?? 'Opportunity (no longer listed)'}
                  {r.shifts?.opportunities?.cause && <span className="block text-xs text-ink-500">{CAUSE_LABELS[r.shifts.opportunities.cause]}</span>}
                  {r.note && <span className="block text-xs text-ink-500">“{r.note}”</span>}
                </td>
                <td className="px-4 py-2.5">{r.organizations?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{Number(r.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-500">
        Each entry was verified by staff of the listed organization; volunteers cannot record or edit their own hours.
      </p>
      </section>
      <ParticipationSection />
    </div>
  )
}
