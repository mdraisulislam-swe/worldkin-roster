import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Constants, type Enums } from '../lib/database.types'
import { CAUSE_LABELS, MODE_LABELS } from '../lib/format'
import { COMPENSATION_LABELS, COMPENSATION_TYPES, searchOpportunities, type CompensationType, type OpportunitySearch, type SearchSort } from '../lib/platform'
import { useNow } from '../lib/useNow'
import { toAppError } from '../lib/errors'
import { CardSkeletons, OpportunityCardView } from '../components/cards'
import { Button, Card, Checkbox, EmptyState, ErrorState, PageHeader, Select, TextField } from '../components/ui'
import { Icon, type IconName } from '../components/Icon'

const field = 'min-h-11 w-full rounded-lg border border-[#d5d9d2] bg-white text-[15px] text-ink-900 outline-none placeholder:text-ink-500/80 focus:border-brand-600 focus:ring-3 focus:ring-brand-600/25'
const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-[#d5d9d2] bg-white text-ink-700 hover:border-brand-600'}`

function IconInput({ icon, label, ...rest }: { icon: IconName; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Icon name={icon} size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
      <input {...rest} className={`${field} pl-10 pr-3`} />
    </label>
  )
}

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
  const setOne = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete('page'); setParams(n) }
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1
  const activeFilters = FILTER_KEYS.filter((k) => k !== 'sort' && params.get(k)).length + (params.get('open') ? 1 : 0)

  return (
    <>
      <PageHeader title="Explore opportunities" subtitle="Voluntary, stipend-based and paid roles from verified organizations." />
      <Card className="mb-6 sm:p-6">
        {/* Keyed to the URL so the fields always show the active filters (Clear, back/forward). */}
        <form key={params.toString()} className="flex flex-col gap-4" role="search" onSubmit={(e) => { e.preventDefault(); update(e.currentTarget) }}>
          {/* Prototype row 1: search, location, date, sort */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <div className="sm:col-span-2 lg:col-span-1"><IconInput icon="search" label="Search" name="q" defaultValue={search.query} placeholder="Search title, skill or organization" /></div>
            <IconInput icon="map-pin" label="City" name="city" defaultValue={search.city} placeholder="Any city" />
            <IconInput icon="calendar" label="Available from" name="from" type="date" defaultValue={from} />
            <label className="block">
              <span className="sr-only">Sort</span>
              <select name="sort" defaultValue={search.sort} className={`${field} px-3`}>
                <option value="soonest">Soonest first</option><option value="closing">Closing soon</option><option value="newest">Newest</option>
                <option value="most_open">Most seats left</option><option value="relevance">Relevance</option>
              </select>
            </label>
          </div>
          {/* Prototype row 2: chip groups (apply immediately). Opportunity-kind chips need wk10, so mode is offered here. */}
          <input type="hidden" name="mode" value={search.mode ?? ''} />
          <input type="hidden" name="comp" value={search.compensation ?? ''} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
              {(['', ...Constants.public.Enums.opportunity_mode] as const).map((m) => (
                <button key={m || 'any'} type="button" aria-pressed={(search.mode ?? '') === m} className={chip((search.mode ?? '') === m)} onClick={() => setOne('mode', m)}>
                  {m ? MODE_LABELS[m] : 'Any mode'}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Compensation" className="flex flex-wrap gap-2">
              {(['', ...COMPENSATION_TYPES] as const).map((c) => (
                <button key={c || 'any'} type="button" aria-pressed={(search.compensation ?? '') === c} className={chip((search.compensation ?? '') === c)} onClick={() => setOne('comp', c)}>
                  {c ? COMPENSATION_LABELS[c] : 'Any pay'}
                </button>
              ))}
            </div>
          </div>
          {/* Row 3: open seats, more filters, apply */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox label="Only with open seats" name="open" defaultChecked={search.onlyOpen} />
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams())}>Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}</Button>}
              <Button type="submit" size="sm">Apply filters</Button>
            </div>
          </div>
          <details className="group rounded-lg border border-neutral-100 px-4 py-2 open:pb-4" open={!!(search.cause || search.country || search.skill)}>
            <summary className="cursor-pointer list-none text-sm font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1.5"><Icon name="chevron-right" size={16} className="transition-transform group-open:rotate-90" />More filters</span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Select label="Cause" name="cause" defaultValue={search.cause ?? ''}
                options={[{ value: '', label: 'All causes' }, ...Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))]} />
              <TextField label="Country" name="country" defaultValue={search.country} placeholder="BD" maxLength={2} hint="2-letter code" />
              <TextField label="Skill" name="skill" defaultValue={search.skill} placeholder="first aid" />
            </div>
          </details>
        </form>
      </Card>

      <nav aria-label="Quick cause filter" className="-mt-2 mb-5 hidden flex-wrap gap-2 sm:flex">
        {(['', ...Constants.public.Enums.cause_category] as const).map((c) => {
          const active = (search.cause ?? '') === c
          return (
            <button key={c || 'all'} type="button" aria-pressed={active} className={chip(active)}
              onClick={() => setOne('cause', c)}>
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
