import { useState } from 'react'

type Bucket = { key: string; label: string; year: number; hours: number }

/**
 * Single-series column chart of organization-verified hours per month.
 * Marks: ≤24px columns, 4px rounded data-end, square at the baseline, hairline baseline.
 * Hover shows a tooltip per column; the same values are in a data table (always available to screen readers, visible on request).
 */
export function HoursChart({ data }: { data: Bucket[] }) {
  const [showTable, setShowTable] = useState(false)
  const max = Math.max(...data.map((d) => d.hours), 0)
  const peak = data.findIndex((d) => d.hours === max && max > 0)
  const H = 120
  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink-900">Verified hours per month <span className="font-normal text-ink-500">· last {data.length} months</span></span>
        <button type="button" className="text-xs text-brand-700 underline" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
      </figcaption>
      {max === 0 ? (
        <p className="rounded-md border border-dashed border-black/15 px-4 py-6 text-center text-sm text-ink-500">No verified hours in this period yet.</p>
      ) : (
        <div aria-hidden className="relative">
          <div className="flex items-end justify-between gap-2 border-b border-black/10" style={{ height: H + 18 }}>
            {data.map((d, i) => {
              const h = d.hours > 0 ? Math.max(4, Math.round((d.hours / max) * H)) : 0
              return (
                <div key={d.key} className="group relative flex flex-1 flex-col items-center justify-end">
                  {i === peak && <span className="mb-1 text-xs font-medium tabular-nums text-ink-700">{d.hours}</span>}
                  <div className="w-full max-w-6 rounded-t bg-brand-600 transition-opacity group-hover:opacity-80" style={{ height: h }} />
                  <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-ink-900 px-2 py-1 text-xs text-white group-hover:block">
                    {d.label} {d.year}: {d.hours} h
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between gap-2">
            {data.map((d) => <span key={d.key} className="flex-1 text-center text-xs text-ink-500">{d.label}</span>)}
          </div>
        </div>
      )}
      <table className={showTable ? 'mt-3 w-full text-left text-sm' : 'sr-only'}>
        <caption className="sr-only">Verified hours per month</caption>
        <thead><tr><th scope="col" className="py-1">Month</th><th scope="col" className="py-1 text-right">Verified hours</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.key} className="border-t border-black/5"><td className="py-1">{d.label} {d.year}</td><td className="py-1 text-right tabular-nums">{d.hours}</td></tr>)}</tbody>
      </table>
    </figure>
  )
}
