import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Constants, type Enums } from '../lib/database.types'
import { CAUSE_LABELS, MODE_LABELS } from '../lib/format'
import { COMPENSATION_LABELS, COMPENSATION_TYPES, searchOpportunities, type CompensationType, type OpportunitySearch, type SearchSort } from '../lib/platform'
import { useNow } from '../lib/useNow'
import { toAppError } from '../lib/errors'
import { CardSkeletons, OpportunityCardView } from '../components/cards'
import { Button, Card, Checkbox, EmptyState, ErrorState, PageHeader, Select, TextField } from '../components/ui'

const FILTER_KEYS = ['q', 'cause', 'country', 'city', 'mode', 'comp', 'skill', 'from', 'sort'] as const

/** Discovery (M05): full-text search + filters + sort + pagination; state kept in the URL so results are shareable. */
export function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const now = useNow()
  const from = params.get('from') ?? ''
  const search: OpportunitySearch = {
    query: params.get('q') ?? '',
    cause: (params.get('cause') || undefined) as Enums<'cause_category'> | undefined,
    country: params.get('country') ?? '',
    city: params.get('city') ?? '',
    mode: (params.get('mode') || undefined) as Enums<'opportunity_mode'> | undefined,
    compensation: (params.get('comp') || undefined) as CompensationType | undefined,
    skill: params.get('skill') ?? '',
    startsAfter: from ? new Date(from).toISOString() : undefined,
    onlyOpen: params.get('open') === '1',
    sort: (params.get('sort') as SearchSort) || 'soonest',
    page,
  }
  const q = useQuery({ queryKey: ['search', search], queryFn: () => searchOpportunities(search) })

  function update(form: HTMLFormElement) {
    const f = new FormData(form)
    const next = new URLSearchParams()
    for (const k of FILTER_KEYS) {
      const v = String(f.get(k) ?? '').trim()
      if (v) next.set(k, k === 'country' ? v.toUpperCase() : v)
    }
    if (f.get('open')) next.set('open', '1')
    setParams(next)
  }
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1
  const activeFilters = FILTER_KEYS.filter((k) => k !== 'sort' && params.get(k)).length + (params.get('open') ? 1 : 0)

  return (
    <>
      <PageHeader title="Explore opportunities" subtitle="Voluntary, stipend-based and paid roles from verified organizations." />
      <Card className="mb-6">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search" onSubmit={(e) => { e.preventDefault(); update(e.currentTarget) }}>
          <div className="sm:col-span-2"><TextField label="Search" name="q" defaultValue={search.query} placeholder="e.g. food, teaching, translation" /></div>
          <Select label="Cause" name="cause" defaultValue={search.cause ?? ''}
            options={[{ value: '', label: 'All causes' }, ...Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))]} />
          <Select label="Type" name="comp" defaultValue={search.compensation ?? ''}
            options={[{ value: '', label: 'Any type' }, ...COMPENSATION_TYPES.map((c) => ({ value: c, label: COMPENSATION_LABELS[c] }))]} />
          <Select label="Mode" name="mode" defaultValue={search.mode ?? ''}
            options={[{ value: '', label: 'Any' }, ...Constants.public.Enums.opportunity_mode.map((m) => ({ value: m, label: MODE_LABELS[m] }))]} />
          <Select label="Sort" name="sort" defaultValue={search.sort}
            options={[{ value: 'soonest', label: 'Soonest shift' }, { value: 'closing', label: 'Closing soon' }, { value: 'newest', label: 'Newest' }, { value: 'most_open', label: 'Most open spots' }, { value: 'relevance', label: 'Relevance' }]} />
          <TextField label="Country" name="country" defaultValue={search.country} placeholder="BD" maxLength={2} hint="2-letter code" />
          <TextField label="City" name="city" defaultValue={search.city} placeholder="Dhaka" />
          <TextField label="Skill" name="skill" defaultValue={search.skill} placeholder="first aid" />
          <TextField label="Available from" name="from" type="date" defaultValue={from} />
          <div className="flex items-end gap-4 sm:col-span-2">
            <Checkbox label="Only with open spots" name="open" defaultChecked={search.onlyOpen} />
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-6">
            <Button type="submit">Apply filters</Button>
            {activeFilters > 0 && <Button type="button" variant="ghost" onClick={() => setParams(new URLSearchParams())}>Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}</Button>}
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

      {q.isPending && <CardSkeletons count={6} />}
      {q.isError && <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="No opportunities match these filters">Try removing a filter or widening the dates.</EmptyState>}
      {q.data && q.data.rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-500" aria-live="polite">{q.data.total} result{q.data.total === 1 ? '' : 's'}</p>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {q.data.rows.map((o) => <li key={o.id}><OpportunityCardView o={o} now={now} /></li>)}
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
