/**
 * "Add to calendar" as a downloadable .ics file (RFC 5545). No external
 * service, no infrastructure. Reduces no-shows by putting shifts in the
 * volunteer's own calendar.
 */
export type CalendarEvent = { uid: string; title: string; startsAt: string; endsAt: string; description?: string; location?: string; url?: string }

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
// RFC 5545 text escaping
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function buildIcs(e: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Worldkin Roster//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.uid}@worldkin-roster`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`,
    e.description ? `DESCRIPTION:${esc(e.description)}` : '',
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.url ? `URL:${e.url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n') + '\r\n'
}

export function downloadIcs(e: CalendarEvent): void {
  const blob = new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${e.title.replace(/[^\w-]+/g, '-').slice(0, 60) || 'shift'}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
