import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { createOpportunity, createShift, getOpportunity, getOpportunityShifts, updateOpportunity } from '../lib/api'
import { Constants, type Tables } from '../lib/database.types'
import { toAppError } from '../lib/errors'
import { CAUSE_LABELS, MODE_LABELS, formatShiftWindow, fromLocalInput } from '../lib/format'
import { fieldErrors, opportunityExtraSchema, opportunitySchema, shiftSchema } from '../lib/validation'
import { COMPENSATION_LABELS, COMPENSATION_TYPES, SELECTION_LABELS, SELECTION_MODES, type OpportunityExtra } from '../lib/platform'
import { toLocalInput } from '../lib/format'
import { Alert, Button, Card, Checkbox, EmptyState, ErrorState, LoadingState, PageHeader, Select, StatusBadge, TextArea, TextField } from '../components/ui'
import { useDialog } from '../components/dialog'
import { useAuth } from '../auth/AuthProvider'
import { useNow } from '../lib/useNow'
import { OpportunityCardView } from '../components/cards'
import { Icon } from '../components/Icon'
import type { OpportunityCard } from '../lib/platform'

/** Prototype segmented control / radio cards: native radios, so the existing FormData submit is unchanged. */
function Segmented({ name, value, options, label }: { name: string; value: string; options: { value: string; label: string }[]; label: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-900">{label}</legend>
      <div className="inline-flex flex-wrap rounded-lg border border-[#d5d9d2] bg-white p-1">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === value} className="peer sr-only" />
            <span className="inline-flex min-h-9 items-center rounded-md px-4 text-sm font-semibold text-ink-700 peer-checked:bg-brand-700 peer-checked:text-white peer-focus-visible:ring-3 peer-focus-visible:ring-brand-600/40">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function readOpportunityForm(form: HTMLFormElement) {
  const f = new FormData(form)
  const base = opportunitySchema.safeParse({
    ...Object.fromEntries(f),
    requires_skill_match: f.get('requires_skill_match') === 'on',
    is_sensitive: f.get('is_sensitive') === 'on',
  })
  const extra = opportunityExtraSchema.safeParse(Object.fromEntries(f))
  if (!base.success || !extra.success) {
    return { success: false as const, errors: { ...(extra.success ? {} : fieldErrors(extra.error)), ...(base.success ? {} : fieldErrors(base.error)) } }
  }
  return { success: true as const, data: { ...base.data, ...extra.data } }
}

/** Card data for the live preview: only what the form contains (no invented numbers). */
function previewCard(d: Record<string, string> | null, o: Tables<'opportunities'> | undefined, ox: OpportunityExtra | undefined, orgName: string): OpportunityCard {
  const v = (k: string, fallback: string) => d?.[k] ?? fallback
  return {
    id: o?.id ?? 'preview', org_id: o?.org_id ?? '', org_name: orgName, org_slug: '',
    title: v('title', o?.title ?? '') || 'Opportunity title',
    cause: v('cause', o?.cause ?? 'humanitarian') as OpportunityCard['cause'],
    mode: v('mode', o?.mode ?? 'onsite') as OpportunityCard['mode'],
    country_code: v('country_code', o?.country_code ?? '') || null, city: v('city', o?.city ?? '') || null,
    is_sensitive: false, published_at: null,
    compensation_type: v('compensation_type', ox?.compensation_type ?? 'voluntary') as OpportunityCard['compensation_type'],
    compensation_details: v('compensation_details', ox?.compensation_details ?? '') || null,
    selection_mode: v('selection_mode', ox?.selection_mode ?? 'open') as OpportunityCard['selection_mode'],
    application_deadline: null, skills_wanted: [], next_shift_at: null, upcoming_shifts: 0, open_spots: 0, total_count: 0,
  }
}

export function OpportunityEditorPage() {
  const { orgId = '', oppId } = useParams()
  const isNew = !oppId
  const navigate = useNavigate()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const { memberships } = useAuth()
  const nowTs = useNow()

  const opp = useQuery({ queryKey: ['opportunity', oppId], queryFn: () => getOpportunity(oppId!), enabled: !isNew })

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const publish = submitter?.value === 'publish'
    const parsed = readOpportunityForm(e.currentTarget)
    if (!parsed.success) return setErrors(parsed.errors)
    setErrors({}); setNotice(null); setBusy(true)
    try {
      if (isNew) {
        const created = await createOpportunity(orgId, parsed.data, publish)
        navigate(created ? `/org/${orgId}/opportunities/${created.id}` : `/org/${orgId}`, { replace: true })
      } else {
        await updateOpportunity(oppId!, parsed.data)
        setNotice({ tone: 'success', text: 'Saved.' })
        void qc.invalidateQueries({ queryKey: ['opportunity', oppId] })
      }
      void qc.invalidateQueries({ queryKey: ['org-opps', orgId] })
    } catch (err) {
      setNotice({ tone: 'error', text: toAppError(err).message })
    } finally {
      setBusy(false)
    }
  }

  const status = useMutation({
    mutationFn: (s: 'published' | 'closed') => updateOpportunity(oppId!, { status: s }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['opportunity', oppId] }); void qc.invalidateQueries({ queryKey: ['org-opps', orgId] }) },
    onError: (err) => setNotice({ tone: 'error', text: toAppError(err).message }),
  })

  if (!isNew && opp.isPending) return <LoadingState />
  if (!isNew && opp.isError) return <ErrorState message={toAppError(opp.error).message} onRetry={() => opp.refetch()} />
  const o = opp.data
  const ox = o as (NonNullable<typeof o> & OpportunityExtra) | undefined

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader
        title={isNew ? 'New opportunity' : o!.title}
        subtitle={<>Fields marked * are required. Saved drafts are visible only to your team. <Link className="text-brand-700 underline" to={`/org/${orgId}`}>Back to organization</Link></>}
        actions={!isNew && o && (
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={o.status} />
            {o.status === 'draft' && <Button busy={status.isPending} onClick={() => status.mutate('published')}>Publish</Button>}
            {o.status !== 'closed' && <Button variant="secondary" busy={status.isPending}
              onClick={async () => { if (await dialog.confirm({ title: 'Close this opportunity?', message: 'It disappears from public listings and cannot be reopened.', confirmLabel: 'Close opportunity', danger: true })) status.mutate('closed') }}>Close</Button>}
          </span>
        )}
      />
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate key={o?.updated_at ?? 'new'}
          onChange={(e) => setDraft(Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)])))}>
          <section className={`flex flex-col gap-4 ${'rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(20,26,34,0.04)] sm:p-7'}`} aria-labelledby="sec-basics">
            <h2 id="sec-basics" className="text-xl font-semibold">Basics</h2>
            <TextField label="Title *" name="title" defaultValue={o?.title} error={errors.title} />
            <TextArea label="Description *" name="description" defaultValue={o?.description} error={errors.description} />
            <Select label="Cause *" name="cause" defaultValue={o?.cause ?? 'humanitarian'}
              options={Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))} />
            <TextArea label="Responsibilities / eligibility" name="requirements" defaultValue={o?.requirements ?? ''} error={errors.requirements} />
            <TextField label="Required skills" name="skills_wanted" defaultValue={o?.skills_wanted.join(', ')} hint="Comma-separated" error={errors.skills_wanted} />
            <Checkbox label="Volunteers must have at least one of these skills" name="requires_skill_match" defaultChecked={o?.requires_skill_match} />
            <Checkbox label="Sensitive (conflict / high-risk): hide from visitors who are not signed in" name="is_sensitive" defaultChecked={o?.is_sensitive} />
          </section>
          <section className={`flex flex-col gap-4 ${'rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(20,26,34,0.04)] sm:p-7'}`} aria-labelledby="sec-where">
            <h2 id="sec-where" className="text-xl font-semibold">Where &amp; when</h2>
            <Segmented label="Mode" name="mode" value={o?.mode ?? 'onsite'} options={Constants.public.Enums.opportunity_mode.map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="City" name="city" defaultValue={o?.city ?? ''} hint="City level only — never an exact address." error={errors.city} />
              <TextField label="Country code" name="country_code" maxLength={2} defaultValue={o?.country_code ?? ''} hint="2 letters, e.g. BD" error={errors.country_code} />
            </div>
            <TextField label="Application deadline (application mode only)" name="application_deadline" type="datetime-local"
              defaultValue={ox?.application_deadline ? toLocalInput(ox.application_deadline) : ''} error={errors.application_deadline} />
            <p className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-ink-700"><Icon name="calendar" size={16} className="mt-0.5 text-ink-500" />{isNew ? 'Shifts (dates, times and capacity) are added after the opportunity is saved.' : 'Shifts are managed in the panel on the right.'}</p>
          </section>
          <section className={`flex flex-col gap-4 ${'rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(20,26,34,0.04)] sm:p-7'}`} aria-labelledby="sec-select">
            <h2 id="sec-select" className="text-xl font-semibold">Selection &amp; compensation</h2>
            <fieldset disabled={!isNew && o?.status !== 'draft'}>
              <legend className="mb-1.5 text-sm font-medium text-ink-900">How volunteers are selected</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {SELECTION_MODES.map((m) => (
                  <label key={m} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#d5d9d2] bg-white p-4 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70">
                    <input type="radio" name="selection_mode" value={m} defaultChecked={(ox?.selection_mode ?? 'open') === m} className="mt-1 accent-brand-700" />
                    <span><strong className="block text-sm text-ink-900">{SELECTION_LABELS[m]}</strong>
                      <span className="text-xs text-ink-500">{m === 'open' ? 'First come, with a fair waitlist' : 'Review applicants, send 72 h offers'}</span></span>
                  </label>
                ))}
              </div>
              {!isNew && o?.status !== 'draft' && <p className="mt-1.5 text-xs text-ink-500">Locked once published (applications or sign-ups may exist).</p>}
              {errors.selection_mode && <p className="mt-1.5 text-sm text-rose-700">{errors.selection_mode}</p>}
            </fieldset>
            {!isNew && o?.status !== 'draft' && <input type="hidden" name="selection_mode" value={ox?.selection_mode ?? 'open'} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Compensation *" name="compensation_type" defaultValue={ox?.compensation_type ?? 'voluntary'} error={errors.compensation_type}
                options={COMPENSATION_TYPES.map((c) => ({ value: c, label: COMPENSATION_LABELS[c] }))} />
              <TextField label="Compensation details" name="compensation_details" defaultValue={ox?.compensation_details ?? ''} error={errors.compensation_details}
                hint="Required for stipend and paid roles — shown to volunteers before they apply." maxLength={500} />
            </div>
          </section>
          <div className="flex flex-wrap gap-2">
            {isNew && <Button type="submit" value="publish" busy={busy}>Save and publish</Button>}
            <Button type="submit" value="draft" busy={busy} variant={isNew ? 'secondary' : 'primary'}>{isNew ? 'Save as draft' : 'Save changes'}</Button>
            <Link to={`/org/${orgId}`} className="inline-flex min-h-11 items-center rounded-lg px-4 text-[15px] font-semibold text-brand-700 hover:bg-brand-50">Cancel</Link>
          </div>
        </form>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <p className="text-sm text-ink-500">Live preview</p>
          {/* Preview of what you typed, rendered with the real listing card (not clickable). */}
          <div inert className="pointer-events-none">
            <OpportunityCardView now={nowTs} o={previewCard(draft, o, ox, memberships.find((m) => m.org_id === orgId)?.organization?.name ?? 'Your organization')} />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <Icon name="info" size={18} /><span>Only verified organizations can publish. Drafts stay private to your team.</span>
          </div>
          {!isNew && o && <ShiftsPanel orgId={orgId} opportunityId={o.id} closed={o.status === 'closed'} />}
        </aside>
      </div>
    </div>
  )
}

function ShiftsPanel({ orgId, opportunityId, closed }: { orgId: string; opportunityId: string; closed: boolean }) {
  const qc = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const shifts = useQuery({ queryKey: ['opp-shifts', opportunityId], queryFn: () => getOpportunityShifts(opportunityId) })
  const add = useMutation({
    mutationFn: (v: Parameters<typeof createShift>[0]) => createShift(v),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Shift added.' }); void qc.invalidateQueries({ queryKey: ['opp-shifts', opportunityId] }) },
    onError: (err) => setNotice({ tone: 'error', text: toAppError(err).message }),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const parsed = shiftSchema.safeParse(Object.fromEntries(new FormData(form)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setNotice(null)
    add.mutate(
      { ...parsed.data, opportunity_id: opportunityId, org_id: orgId, starts_at: fromLocalInput(parsed.data.starts_at), ends_at: fromLocalInput(parsed.data.ends_at) },
      { onSuccess: () => form.reset() },
    )
  }

  return (
    <section aria-labelledby="shifts-h">
      <h2 id="shifts-h" className="mb-3 text-xl font-semibold">Shifts</h2>
      {shifts.isPending && <LoadingState />}
      {shifts.isError && <ErrorState message={toAppError(shifts.error).message} onRetry={() => shifts.refetch()} />}
      {shifts.data?.length === 0 && <EmptyState title="No shifts yet" />}
      <ul className="mb-4 flex flex-col gap-2">
        {shifts.data?.map((s: Tables<'shifts'>) => (
          <li key={s.id}>
            <Card className="flex items-center justify-between gap-2">
              <div>
                <Link className="font-medium hover:underline" to={`/org/${orgId}/shifts/${s.id}`}>{s.title ?? 'Shift'}</Link>
                <p className="text-xs text-ink-500">{formatShiftWindow(s.starts_at, s.ends_at)} · capacity {s.capacity} · waitlist {s.waitlist_limit}</p>
              </div>
              <StatusBadge status={s.status} />
            </Card>
          </li>
        ))}
      </ul>
      {!closed && (
        <Card>
          <h3 className="mb-3 font-medium">Add a shift</h3>
          <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
            <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
            <TextField label="Label (optional)" name="title" error={errors.title} />
            <TextField label="Starts" name="starts_at" type="datetime-local" error={errors.starts_at} />
            <TextField label="Ends" name="ends_at" type="datetime-local" error={errors.ends_at} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Capacity" name="capacity" type="number" min={1} max={500} defaultValue={5} error={errors.capacity} />
              <TextField label="Waitlist limit" name="waitlist_limit" type="number" min={0} max={500} defaultValue={5} error={errors.waitlist_limit} />
            </div>
            <div><Button type="submit" busy={add.isPending}>Add shift</Button></div>
          </form>
        </Card>
      )}
    </section>
  )
}
