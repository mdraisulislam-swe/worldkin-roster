import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { getMyImpact, getMyRecord } from '../lib/api'
import { toAppError } from '../lib/errors'
import { useNow } from '../lib/useNow'
import { CAUSE_LABELS, formatDateTime } from '../lib/format'
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui'
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
    <>
    <article className="mx-auto max-w-3xl rounded-lg border border-black/10 bg-white p-6 print:border-0 print:p-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-700">Worldkin Roster · Verified experience passport</p>
          <h1 className="mt-1 text-2xl font-semibold">{profile?.full_name}</h1>
          <p className="text-sm text-ink-500">Generated {formatDateTime(new Date(now).toISOString())}</p>
        </div>
        <div className="flex gap-2 print:hidden">
                    <Button onClick={() => window.print()}>Print / save as PDF</Button>
        </div>
      </div>
      {impact.data && (
        <dl className="mb-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-brand-50 p-3"><dt className="text-xs text-ink-500">Verified hours</dt><dd className="text-xl font-semibold">{Number(impact.data.verified_hours)}</dd></div>
          <div className="rounded-md bg-brand-50 p-3"><dt className="text-xs text-ink-500">Shifts attended</dt><dd className="text-xl font-semibold">{impact.data.shifts_attended}</dd></div>
          <div className="rounded-md bg-brand-50 p-3"><dt className="text-xs text-ink-500">Organizations</dt><dd className="text-xl font-semibold">{impact.data.organizations_helped}</dd></div>
        </dl>
      )}
      {rows.length > 0 && (
        <section className="mb-8 print:hidden">
          <HoursChart data={hoursByMonth(rows.map((r) => ({ hours: r.hours, when: r.shifts?.starts_at ?? r.verified_at })), now, 6)} />
        </section>
      )}
      {experience.length > 0 && (
        <section aria-labelledby="exp-h" className="mb-8">
          <h2 id="exp-h" className="mb-3 text-lg font-semibold">Experience</h2>
          <ul className="flex flex-col gap-3">
            {experience.map((e) => (
              <li key={e.org + e.title} className="rounded-md border border-black/10 p-4 print:break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">{e.title}</p>
                    <p className="text-sm text-ink-700">{e.org} <span className="text-xs text-emerald-800">· organization-verified</span></p>
                  </div>
                  <p className="text-right text-sm"><span className="text-lg font-semibold text-ink-900">{e.hours}</span> verified h</p>
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
      {declared.length > 0 && (
        <section aria-labelledby="skills-h" className="mb-8">
          <h2 id="skills-h" className="text-lg font-semibold">Skills &amp; languages</h2>
          <p className="mb-2 text-xs text-ink-500">Self-declared on the volunteer's profile — not verified by organizations.</p>
          <ul className="flex flex-wrap gap-2">
            {declared.map((d, i) => <li key={d + i} className="rounded-full border border-black/15 px-3 py-1 text-sm">{d}</li>)}
          </ul>
        </section>
      )}
      <h2 className="mb-2 text-lg font-semibold">Verified sessions</h2>
      {rows.length === 0 ? (
        <EmptyState title="No verified hours yet">Hours appear here after an organization confirms your attendance.</EmptyState>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Verified participation</caption>
          <thead className="border-b border-black/10 text-xs uppercase text-ink-500">
            <tr><th scope="col" className="py-2">Date</th><th scope="col" className="py-2">Opportunity</th><th scope="col" className="py-2">Organization</th><th scope="col" className="py-2 text-right">Hours</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-black/5 align-top">
                <td className="py-2 whitespace-nowrap">{formatDateTime(r.shifts?.starts_at ?? r.verified_at)}</td>
                <td className="py-2">
                  {r.shifts?.opportunities?.title ?? 'Opportunity (no longer listed)'}
                  {r.shifts?.opportunities?.cause && <span className="block text-xs text-ink-500">{CAUSE_LABELS[r.shifts.opportunities.cause]}</span>}
                  {r.note && <span className="block text-xs text-ink-500">“{r.note}”</span>}
                </td>
                <td className="py-2">{r.organizations?.name ?? '—'}</td>
                <td className="py-2 text-right font-medium">{Number(r.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-6 text-xs text-ink-500">
        Each entry was verified by staff of the listed organization; volunteers cannot record or edit their own hours.
      </p>
    </article>
    <ParticipationSection />
    </>
  )
}
