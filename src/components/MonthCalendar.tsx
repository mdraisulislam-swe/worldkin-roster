import { MARK_CLS, MARK_LABEL, dayKey, monthGrid, type CalendarMark } from '../lib/calendarGrid'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Accessible month view: each day is a labelled button (aria-pressed when selected, label lists its
 * activities); dots mark days with activity, with a text legend so colour is never alone.
 */
export function MonthCalendar({ month, marks, selected, today, onSelect, onMonth }: {
  month: Date; marks: Map<string, CalendarMark[]>; selected: string; today: string
  onSelect: (key: string) => void; onMonth: (delta: number) => void
}) {
  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const used = new Set([...marks.values()].flat())
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => onMonth(-1)} className="rounded-md px-2.5 py-1.5 text-sm hover:bg-black/5" aria-label="Previous month">←</button>
        <h2 className="text-base font-semibold" aria-live="polite">{title}</h2>
        <button type="button" onClick={() => onMonth(1)} className="rounded-md px-2.5 py-1.5 text-sm hover:bg-black/5" aria-label="Next month">→</button>
      </div>
      <div role="group" aria-label={title} className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => <div key={w} aria-hidden className="pb-1 text-xs font-medium text-ink-500">{w}</div>)}
        {monthGrid(month).map((d) => {
          const k = dayKey(d)
          const inMonth = d.getMonth() === month.getMonth()
          const m = marks.get(k) ?? []
          const isSel = k === selected, isToday = k === today
          const label = `${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${m.length ? `, ${m.length} item${m.length === 1 ? '' : 's'}: ${[...new Set(m)].map((x) => MARK_LABEL[x]).join(', ')}` : ''}`
          return (
            <button key={k} type="button" aria-pressed={isSel} aria-label={label} onClick={() => onSelect(k)}
              className={`flex min-h-11 flex-col items-center justify-start gap-1 rounded-md py-1.5 text-sm tabular-nums
                ${isSel ? 'bg-brand-700 text-white' : isToday ? 'bg-brand-50 font-semibold text-brand-800' : inMonth ? 'text-ink-900 hover:bg-black/5' : 'text-ink-500/60 hover:bg-black/5'}`}>
              {d.getDate()}
              <span aria-hidden className="flex h-1.5 gap-0.5">
                {[...new Set(m)].slice(0, 3).map((x) => <span key={x} className={`h-1.5 w-1.5 rounded-full ${isSel ? 'bg-white' : MARK_CLS[x]}`} />)}
              </span>
            </button>
          )
        })}
      </div>
      {used.size > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700" aria-label="Legend">
          {[...used].map((x) => <li key={x} className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${MARK_CLS[x]}`} />{MARK_LABEL[x]}</li>)}
        </ul>
      )}
    </div>
  )
}
