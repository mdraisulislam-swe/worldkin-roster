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

export function OpportunityEditorPage() {
  const { orgId = '', oppId } = useParams()
  const isNew = !oppId
  const navigate = useNavigate()
  const qc = useQueryClient()
  const dialog = useDialog()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

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
    <>
      <PageHeader
        title={isNew ? 'New opportunity' : o!.title}
        subtitle={<Link className="text-brand-700 underline" to={`/org/${orgId}`}>Back to organization</Link>}
        actions={!isNew && o && (
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={o.status} />
            {o.status === 'draft' && <Button busy={status.isPending} onClick={() => status.mutate('published')}>Publish</Button>}
            {o.status !== 'closed' && <Button variant="secondary" busy={status.isPending}
              onClick={async () => { if (await dialog.confirm({ title: 'Close this opportunity?', message: 'It disappears from public listings and cannot be reopened.', confirmLabel: 'Close opportunity', danger: true })) status.mutate('closed') }}>Close</Button>}
          </span>
        )}
      />
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate key={o?.updated_at ?? 'new'}>
            <TextField label="Title" name="title" defaultValue={o?.title} error={errors.title} />
            <TextArea label="Description" name="description" defaultValue={o?.description} error={errors.description} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Cause" name="cause" defaultValue={o?.cause ?? 'humanitarian'}
                options={Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))} />
              <Select label="Mode" name="mode" defaultValue={o?.mode ?? 'onsite'}
                options={Constants.public.Enums.opportunity_mode.map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
              <TextField label="Country code" name="country_code" maxLength={2} defaultValue={o?.country_code ?? ''} error={errors.country_code} />
            </div>
            <TextField label="City" name="city" defaultValue={o?.city ?? ''} hint="City level only — never an exact address." error={errors.city} />
            <TextField label="Skills wanted" name="skills_wanted" defaultValue={o?.skills_wanted.join(', ')} hint="Comma-separated" error={errors.skills_wanted} />
            <Checkbox label="Volunteers must have at least one of these skills" name="requires_skill_match" defaultChecked={o?.requires_skill_match} />
            <TextArea label="Eligibility / requirements" name="requirements" defaultValue={o?.requirements ?? ''} error={errors.requirements} />
            <Checkbox label="Sensitive (conflict / high-risk): hide from visitors who are not signed in" name="is_sensitive" defaultChecked={o?.is_sensitive} />
            <fieldset className="flex flex-col gap-4 rounded-md border border-black/10 p-3">
              <legend className="px-1 text-sm font-semibold">Compensation and selection</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Opportunity type" name="compensation_type" defaultValue={ox?.compensation_type ?? 'voluntary'} error={errors.compensation_type}
                  options={COMPENSATION_TYPES.map((c) => ({ value: c, label: COMPENSATION_LABELS[c] }))} />
                <TextField label="Compensation details" name="compensation_details" defaultValue={ox?.compensation_details ?? ''} error={errors.compensation_details}
                  hint="Required for paid and stipend roles, e.g. USD 20/day for meals and transport" maxLength={500} />
              </div>
              <Select label="How volunteers are selected" name="selection_mode" defaultValue={ox?.selection_mode ?? 'open'} error={errors.selection_mode}
                disabled={!isNew && o?.status !== 'draft'} hint={!isNew && o?.status !== 'draft' ? 'Locked once published (applications or sign-ups may exist).' : undefined}
                options={SELECTION_MODES.map((m) => ({ value: m, label: SELECTION_LABELS[m] }))} />
              {!isNew && o?.status !== 'draft' && <input type="hidden" name="selection_mode" value={ox?.selection_mode ?? 'open'} />}
              <TextField label="Application deadline (application mode only)" name="application_deadline" type="datetime-local"
                defaultValue={ox?.application_deadline ? toLocalInput(ox.application_deadline) : ''} error={errors.application_deadline} />
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" value="draft" busy={busy} variant={isNew ? 'secondary' : 'primary'}>{isNew ? 'Save as draft' : 'Save changes'}</Button>
              {isNew && <Button type="submit" value="publish" busy={busy}>Save and publish</Button>}
            </div>
          </form>
        </Card>
        {!isNew && o && <ShiftsPanel orgId={orgId} opportunityId={o.id} closed={o.status === 'closed'} />}
      </div>
    </>
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
    <section className="lg:col-span-2" aria-labelledby="shifts-h">
      <h2 id="shifts-h" className="mb-3 text-lg font-semibold">Shifts</h2>
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
