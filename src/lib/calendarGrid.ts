/** Pure helpers for a Monday-first month grid in the viewer's local time zone. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 6×7 grid of dates covering the month that contains `month`. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i))
}

/** Index items by local day key. */
export function indexByDay<T>(items: T[], dateOf: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = dayKey(new Date(dateOf(it)))
    const list = m.get(k)
    if (list) list.push(it)
    else m.set(k, [it])
  }
  return m
}

/** Verified hours per calendar month for the last `months` months (oldest first), zero-filled. */
export function hoursByMonth(rows: { hours: number | string; when: string }[], now: number, months = 6) {
  const end = new Date(now)
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - (months - 1 - i), 1)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }), year: d.getFullYear(), hours: 0 }
  })
  for (const r of rows) {
    const d = new Date(r.when)
    const b = buckets.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`)
    if (b) b.hours += Number(r.hours)
  }
  return buckets.map((b) => ({ ...b, hours: Math.round(b.hours * 100) / 100 }))
}

export type CalendarMark = 'confirmed' | 'waitlisted' | 'deadline' | 'past'

export const MARK_CLS: Record<CalendarMark, string> = {
  confirmed: 'bg-brand-600',
  waitlisted: 'bg-amber-500',
  deadline: 'bg-rose-600',
  past: 'bg-slate-400',
}
export const MARK_LABEL: Record<CalendarMark, string> = {
  confirmed: 'Confirmed shift',
  waitlisted: 'Waitlisted',
  deadline: 'Offer deadline',
  past: 'Past shift',
}
