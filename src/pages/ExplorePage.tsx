import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { searchOpportunities, type SearchParams } from '../lib/api'
import { Constants, type Enums } from '../lib/database.types'
import { CAUSE_LABELS, MODE_LABELS, formatDateTime, spotsLabel, startsIn } from '../lib/format'
import { useNow } from '../lib/useNow'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Select, TextField, Checkbox } from '../components/ui'
import { toAppError } from '../lib/errors'

/** Discovery (M05): full-text search + filters + sort + pagination, state kept in the URL. */
export function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const now = useNow()
  const search: SearchParams = {
    query: params.get('q') ?? '',
    cause: (params.get('cause') || undefined) as Enums<'cause_category'> | undefined,
    country: params.get('country') ?? '',
    mode: (params.get('mode') || undefined) as Enums<'opportunity_mode'> | undefined,
    onlyOpen: params.get('open') === '1',
    sort: (params.get('sort') as SearchParams['sort']) || 'soonest',
    page,
  }
  const q = useQuery({ queryKey: ['search', search], queryFn: () => searchOpportunities(search) })

  function update(form: HTMLFormElement) {
    const f = new FormData(form)
    const next = new URLSearchParams()
    for (const k of ['q', 'cause', 'country', 'mode', 'sort']) {
      const v = String(f.get(k) ?? '').trim()
      if (v) next.set(k, v)
    }
    if (f.get('open')) next.set('open', '1')
    setParams(next)
  }
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1

  return (
    <>
      <PageHeader title="Explore opportunities" subtitle="Verified organizations looking for volunteers." />
      <Card className="mb-6">
        <form className="grid gap-3 md:grid-cols-6" role="search" onSubmit={(e) => { e.preventDefault(); update(e.currentTarget) }}>
          <div className="md:col-span-2"><TextField label="Search" name="q" defaultValue={search.query} placeholder="e.g. food, teaching, Dhaka" /></div>
          <Select label="Cause" name="cause" defaultValue={search.cause ?? ''}
            options={[{ value: '', label: 'All causes' }, ...Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))]} />
          <Select label="Mode" name="mode" defaultValue={search.mode ?? ''}
            options={[{ value: '', label: 'Any' }, ...Constants.public.Enums.opportunity_mode.map((m) => ({ value: m, label: MODE_LABELS[m] }))]} />
          <TextField label="Country" name="country" defaultValue={search.country} placeholder="BD" maxLength={2} />
          <Select label="Sort" name="sort" defaultValue={search.sort}
            options={[{ value: 'soonest', label: 'Soonest shift' }, { value: 'newest', label: 'Newest' }, { value: 'most_open', label: 'Most open spots' }, { value: 'relevance', label: 'Relevance' }]} />
          <div className="flex items-end gap-4 md:col-span-6">
            <Checkbox label="Only with open spots" name="open" defaultChecked={search.onlyOpen} />
            <Button type="submit">Apply</Button>
          </div>
        </form>
      </Card>

      <nav aria-label="Quick cause filter" className="-mt-2 mb-5 flex flex-wrap gap-2">
        {(['', ...Constants.public.Enums.cause_category] as const).map((c) => {
          const active = (search.cause ?? '') === c
          return (
            <button key={c || 'all'} type="button" aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-brand-700 bg-brand-700 text-white' : 'border-black/15 bg-white hover:border-brand-600'}`}
              onClick={() => { const n = new URLSearchParams(params); if (c) n.set('cause', c); else n.delete('cause'); n.delete('page'); setParams(n) }}>
              {c ? CAUSE_LABELS[c] : 'All causes'}
            </button>
          )
        })}
      </nav>

      {q.isPending && <LoadingState label="Finding opportunities" />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="No opportunities match these filters">Try removing a filter.</EmptyState>}
      {q.data && q.data.rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-500" aria-live="polite">{q.data.total} result{q.data.total === 1 ? '' : 's'}</p>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {q.data.rows.map((o) => (
              <li key={o.id}>
                <Card className="h-full">
                  <p className="text-xs uppercase tracking-wide text-brand-700">{CAUSE_LABELS[o.cause]} · {MODE_LABELS[o.mode]}</p>
                  <h2 className="mt-1 font-semibold"><Link className="hover:underline" to={`/opportunities/${o.id}`}>{o.title}</Link></h2>
                  <p className="text-sm text-ink-500">{o.org_name}{o.city ? ` · ${o.city}` : ''}{o.country_code ? `, ${o.country_code}` : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.next_shift_at && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">{startsIn(o.next_shift_at, now)}</span>}
                    {(() => { const l = spotsLabel(o.open_spots, o.upcoming_shifts); return l && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'}`}>{l.text}</span> })()}
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">Verified organization</span>
                  </div>
                  <p className="mt-2 text-sm">Next shift: {o.next_shift_at ? formatDateTime(o.next_shift_at) : 'none scheduled'}</p>
                  <p className="text-sm">{o.open_spots} open spot{o.open_spots === 1 ? '' : 's'} across {o.upcoming_shifts} shift{o.upcoming_shifts === 1 ? '' : 's'}</p>
                  {o.is_sensitive && <p className="mt-2 text-xs text-amber-800">Sensitive opportunity — visible to signed-in users only.</p>}
                </Card>
              </li>
            ))}
          </ul>
          <nav aria-label="Pagination" className="mt-6 flex items-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => { params.set('page', String(page - 1)); setParams(params) }}>Previous</Button>
            <span className="text-sm text-ink-500">Page {page} of {totalPages}</span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => { params.set('page', String(page + 1)); setParams(params) }}>Next</Button>
          </nav>
        </>
      )}
    </>
  )
}
