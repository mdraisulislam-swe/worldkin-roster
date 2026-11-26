import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { getOpportunityShifts, getOrgOpportunities } from '../lib/api'
import {
  APPLICATION_STATUS_LABELS, ORG_TYPES, ORG_TYPE_LABELS, getOrgApplications, getOrgPrivate, getOrganizationFull, reviewApplication,
  revokeOffer, saveOrgPrivate, sendOffer, signedDocUrl, updateOrganizationPublic, uploadImage, uploadVerificationDoc,
  type ApplicationStatus, type OrgApplication,
} from '../lib/platform'
import { toAppError } from '../lib/errors'
import { formatDateTime, formatShiftWindow } from '../lib/format'
import { organizationDetailsSchema, fieldErrors } from '../lib/validation'
import { useNow } from '../lib/useNow'
import { useDialog } from '../components/dialog'
import { OrgLogo } from '../components/cards'
import { Alert, Button, Card, Checkbox, EmptyState, ErrorState, Initials, LoadingState, PageHeader, Select, StatusBadge, TextArea, TextField } from '../components/ui'
import { TABLE } from '../lib/table'
import { Icon } from '../components/Icon'

const STATUS_FILTERS: { value: '' | ApplicationStatus; label: string }[] = [
  { value: '', label: 'All' }, { value: 'submitted', label: 'New' }, { value: 'under_review', label: 'Under review' },
  { value: 'selected', label: 'Selected (offer out)' }, { value: 'rejected', label: 'Rejected' }, { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'declined', label: 'Declined' }, { value: 'expired', label: 'Expired' },
]

/** Applicant review, selection and offers (organization staff). */
export function OrgApplicationsPage() {
  const { orgId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') || undefined) as ApplicationStatus | undefined
  const opportunityId = params.get('opportunity') || undefined
  const includeClosed = params.get('closed') === '1'
  const qc = useQueryClient()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const opps = useQuery({ queryKey: ['org-opps', orgId], queryFn: () => getOrgOpportunities(orgId) })
  const apps = useQuery({ queryKey: ['org-applications', orgId, opportunityId, status], queryFn: () => getOrgApplications(orgId, opportunityId, status) })
  const onDone = (text: string, tone: 'success' | 'info' = 'success') => { setNotice({ tone, text }); void qc.invalidateQueries({ queryKey: ['org-applications', orgId] }) }
  const onError = (e: unknown) => { setNotice({ tone: 'error', text: toAppError(e).message }); void apps.refetch() }
  const closedIds = new Set((opps.data ?? []).filter((o) => o.status === 'closed').map((o) => o.id))
  const oppOptions = (opps.data ?? []).filter((o) => includeClosed || o.status !== 'closed' || o.id === opportunityId)
  const visible = (apps.data ?? []).filter((a) => includeClosed || opportunityId || !closedIds.has(a.opportunity_id))
  const hiddenClosed = (apps.data?.length ?? 0) - visible.length

  return (
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Applicants & offers" subtitle="Review applicants, select or reject, and send time-limited offers for a specific shift." />
      {/* Enforced by the database: org_applications returns no phone, email or address (live check L7). */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Icon name="shield-check" size={18} />
        <span>Applicant phone, email and address are never shown. You see the profile, skills and verified hours they share when applying.</span>
      </div>
      <Card>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget); const n = new URLSearchParams()
          for (const k of ['opportunity', 'status']) { const v = String(f.get(k) ?? ''); if (v) n.set(k, v) }
          if (f.get('closed')) n.set('closed', '1')
          setParams(n)
        }}>
          <Select label="Opportunity" name="opportunity" defaultValue={opportunityId ?? ''}
            options={[{ value: '', label: includeClosed ? 'All opportunities' : 'All active opportunities' }, ...oppOptions.map((o) => ({ value: o.id, label: o.status === 'closed' ? `${o.title} (closed)` : o.title }))]} />
          <Select label="Status" name="status" defaultValue={status ?? ''} options={STATUS_FILTERS} />
          <div className="flex flex-wrap items-end gap-4">
            <Checkbox label="Include closed opportunities" name="closed" defaultChecked={includeClosed} />
            <Button type="submit">Filter</Button>
          </div>
        </form>
      </Card>
      <div aria-live="polite" className="empty:-mt-6">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {apps.isPending && <LoadingState label="Loading applicants" />}
      {apps.isError && <ErrorState message={toAppError(apps.error).message} onRetry={() => apps.refetch()} />}
      {apps.data && visible.length === 0 && (
        <EmptyState title="No applications here yet">Publish an opportunity with “Application” selection to receive applicants.</EmptyState>
      )}
      {apps.data && visible.length > 0 && (
        <div>
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <caption className="sr-only">Applicants</caption>
              <thead className={TABLE.thead}>
                <tr>
                  <th scope="col" className={TABLE.th}>Applicant</th>
                  <th scope="col" className={TABLE.th}>Verified hours</th>
                  <th scope="col" className={TABLE.th}>Skills</th>
                  <th scope="col" className={TABLE.th}>Applied</th>
                  <th scope="col" className={TABLE.th}>Status</th>
                  <th scope="col" className={TABLE.th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className={TABLE.tbody}>
                {visible.map((a) => <ApplicantRow key={a.application_id} a={a} onDone={onDone} onError={onError} />)}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">Showing {visible.length} of {apps.data.length}{hiddenClosed > 0 ? ` · ${hiddenClosed} for closed opportunities hidden — tick “Include closed opportunities” to see them` : ''}</p>
        </div>
      )}
      {apps.data && visible.length === 0 && hiddenClosed > 0 && <p className="text-sm text-ink-500">{hiddenClosed} application{hiddenClosed === 1 ? '' : 's'} for closed opportunities hidden — tick “Include closed opportunities” to see them.</p>}
    </div>
  )
}

function ApplicantRow({ a, onDone, onError }: { a: OrgApplication; onDone: (t: string, tone?: 'success' | 'info') => void; onError: (e: unknown) => void }) {
  const dialog = useDialog()
  const now = useNow()
  const { orgId = '' } = useParams()
  const [open, setOpen] = useState(false)
  const shifts = useQuery({ queryKey: ['opp-shifts', a.opportunity_id], queryFn: () => getOpportunityShifts(a.opportunity_id), enabled: open })
  const review = useMutation({ mutationFn: (v: { action: 'under_review' | 'reject' | 'note'; reason?: string | null; note?: string | null }) => reviewApplication(a.application_id, v.action, v.reason, v.note), onError })
  const offer = useMutation({ mutationFn: (v: { shiftId: string; message: string | null }) => sendOffer(a.application_id, v.shiftId, v.message), onError })
  const revoke = useMutation({ mutationFn: (reason: string | null) => revokeOffer(a.offer_id!, reason), onError })
  const final = ['rejected', 'withdrawn', 'declined'].includes(a.status) || a.offer_status === 'accepted'
  const pendingOffer = a.offer_status === 'pending' && a.offer_expires_at && new Date(a.offer_expires_at).getTime() > now
  const futureShifts = (shifts.data ?? []).filter((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() > now)

  const detailsId = `applicant-${a.application_id}`
  const location = [a.applicant_city, a.applicant_country].filter(Boolean).join(', ') || 'Location not shared'
  return (
    <>
      <tr className={TABLE.tr}>
        <td className={TABLE.td}>
          <div className="flex min-w-0 items-center gap-3">
            <Initials name={a.applicant_name} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{a.applicant_name}</p>
              <p className="truncate text-xs text-ink-500">{location} · {a.opportunity_title}</p>
              <p className="text-xs text-ink-500 md:hidden">{Number(a.applicant_verified_hours)} verified h · applied {formatDateTime(a.created_at)}</p>
              {pendingOffer && <p className="text-xs text-amber-800 md:hidden">Offer expires {formatDateTime(a.offer_expires_at!)}</p>}
              {a.offer_status === 'accepted' && <p className="text-xs text-emerald-800 md:hidden">Shift {a.shift_starts_at ? formatDateTime(a.shift_starts_at) : ''} · place: {a.signup_status}</p>}
            </div>
          </div>
        </td>
        <td className={`${TABLE.td} ${TABLE.hideSm} whitespace-nowrap tabular-nums`}>{Number(a.applicant_verified_hours)} h</td>
        <td className={`${TABLE.td} ${TABLE.hideSm}`}>
          {a.applicant_skills.length
            ? <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[12.5px] font-semibold text-emerald-800" title={a.applicant_skills.join(', ')}><Icon name="check" size={14} />{a.applicant_skills.length} skill{a.applicant_skills.length === 1 ? '' : 's'}</span>
            : <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-neutral-100 px-2.5 text-[12.5px] font-semibold text-ink-700">None listed</span>}
        </td>
        <td className={`${TABLE.td} ${TABLE.hideSm} whitespace-nowrap`}>{formatDateTime(a.created_at)}</td>
        <td className={TABLE.td}>
          <StatusBadge status={a.offer_status === 'accepted' ? 'accepted' : a.status} />
          <span className="sr-only">{APPLICATION_STATUS_LABELS[a.status]}</span>
          {pendingOffer && <p className="mt-1 hidden text-xs text-amber-800 md:block">Offer expires {formatDateTime(a.offer_expires_at!)}</p>}
          {a.offer_status === 'accepted' && <p className="mt-1 hidden text-xs text-emerald-800 md:block">Shift {a.shift_starts_at ? formatDateTime(a.shift_starts_at) : ''} · place: {a.signup_status}</p>}
        </td>
        <td className={`${TABLE.td} ${TABLE.fullSm} text-right max-md:text-left`}>
          <Button size="sm" variant="secondary" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Review'}</Button>
        </td>
      </tr>
      {open && (
        <tr id={detailsId} className="border-t border-neutral-100 bg-[#fbfcfa] max-md:block">
          <td colSpan={6} className="px-4 py-4 max-md:block">
          <div className="grid gap-4 lg:grid-cols-2">
            <dl className="flex flex-col gap-2 text-sm">
              {a.message && <div><dt className="font-medium">Application message</dt><dd className="whitespace-pre-line text-ink-700">{a.message}</dd></div>}
              {a.applicant_bio && <div><dt className="font-medium">About</dt><dd className="text-ink-700">{a.applicant_bio}</dd></div>}
              {a.applicant_experience && <div><dt className="font-medium">Experience</dt><dd className="whitespace-pre-line text-ink-700">{a.applicant_experience}</dd></div>}
              {a.applicant_education && <div><dt className="font-medium">Education</dt><dd className="text-ink-700">{a.applicant_education}</dd></div>}
              {a.applicant_languages.length > 0 && <div><dt className="font-medium">Languages</dt><dd className="text-ink-700">{a.applicant_languages.join(', ')}</dd></div>}
              {a.applicant_interests.length > 0 && <div><dt className="font-medium">Interests</dt><dd className="text-ink-700">{a.applicant_interests.join(', ')}</dd></div>}
              {a.applicant_availability && <div><dt className="font-medium">Availability</dt><dd className="text-ink-700">{a.applicant_availability}</dd></div>}
              {a.decision_reason && <div><dt className="font-medium">Rejection reason (shared with volunteer)</dt><dd className="text-ink-700">{a.decision_reason}</dd></div>}
              <p className="text-xs text-ink-500">Contact details are never shown here; they stay private to the volunteer.</p>
            </dl>
            <div className="flex flex-col gap-3">
              <form onSubmit={(e) => { e.preventDefault(); const note = String(new FormData(e.currentTarget).get('note') ?? ''); review.mutate({ action: 'note', note }, { onSuccess: () => onDone('Private note saved.', 'info') }) }} className="flex flex-col gap-2">
                <TextArea label="Internal note (private to your team)" name="note" defaultValue={a.note ?? ''} maxLength={2000} rows={2} />
                <div><Button type="submit" variant="secondary" busy={review.isPending && review.variables?.action === 'note'}>Save note</Button></div>
              </form>
              {!final && (
                <div className="flex flex-wrap gap-2">
                  {a.status === 'submitted' && <Button variant="secondary" busy={review.isPending && review.variables?.action === 'under_review'}
                    onClick={() => review.mutate({ action: 'under_review' }, { onSuccess: () => onDone('Marked as under review; the volunteer was notified.') })}>Mark under review</Button>}
                  <Button variant="danger" busy={review.isPending && review.variables?.action === 'reject'} onClick={async () => {
                    const reason = await dialog.prompt({ title: 'Reject this application?', label: 'Reason shared with the volunteer (optional)', required: false, confirmLabel: 'Reject', danger: true })
                    if (reason !== null) review.mutate({ action: 'reject', reason: reason || null }, { onSuccess: () => onDone('Application rejected; the volunteer was notified.') })
                  }}>Reject</Button>
                  {pendingOffer && <Button variant="secondary" busy={revoke.isPending} onClick={async () => {
                    const reason = await dialog.prompt({ title: 'Revoke the pending offer?', label: 'Reason (optional, shared)', required: false, confirmLabel: 'Revoke', danger: true })
                    if (reason !== null) revoke.mutate(reason || null, { onSuccess: () => onDone('Offer revoked; the application is back under review.') })
                  }}>Revoke offer</Button>}
                </div>
              )}
              {!final && !pendingOffer && (
                <form className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-white p-3" onSubmit={(e) => {
                  e.preventDefault(); const f = new FormData(e.currentTarget)
                  const shiftId = String(f.get('shift') ?? ''); const message = String(f.get('message') ?? '').trim()
                  if (!shiftId) return onError(new Error('Choose a shift for the offer.'))
                  offer.mutate({ shiftId, message: message || null }, { onSuccess: (r) => onDone(`Offer sent. It expires ${formatDateTime(r.expires_at)} (72 hours or the shift start, whichever is first).`) })
                }}>
                  <p className="text-sm font-medium">Select and send an offer</p>
                  {shifts.isPending ? <LoadingState label="Loading shifts" /> : futureShifts.length === 0 ? (
                    <p className="text-sm text-ink-500">No upcoming shifts. <Link className="underline" to={`/org/${orgId}/opportunities/${a.opportunity_id}`}>Add a shift</Link> to this opportunity first.</p>
                  ) : (
                    <>
                      <Select label="Shift" name="shift" options={futureShifts.map((s) => ({ value: s.id, label: `${s.title ?? 'Shift'} · ${formatShiftWindow(s.starts_at, s.ends_at)} · capacity ${s.capacity}` }))} />
                      <TextField label="Message to the volunteer (optional)" name="message" maxLength={1000} />
                      <div><Button type="submit" busy={offer.isPending}>Send offer</Button></div>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>
          </td>
        </tr>
      )}
    </>
  )
}

/** Organization profile, contact details, logo and private verification documents (org admins). */
export function OrgSettingsPage() {
  const { orgId = '' } = useParams()
  const { refresh } = useAuth()
  const qc = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const org = useQuery({ queryKey: ['org-full', orgId], queryFn: () => getOrganizationFull(orgId) })
  const priv = useQuery({ queryKey: ['org-private', orgId], queryFn: () => getOrgPrivate(orgId) })
  const reload = () => { void qc.invalidateQueries({ queryKey: ['org-full', orgId] }); void qc.invalidateQueries({ queryKey: ['org-private', orgId] }); void qc.invalidateQueries({ queryKey: ['org', orgId] }) }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget))
    const parsed = organizationDetailsSchema.safeParse(f)
    const description = String(f.description ?? '').trim()
    const website = String(f.website ?? '').trim()
    const errs = parsed.success ? {} : fieldErrors(parsed.error)
    if (website && !/^https?:\/\/\S+$/i.test(website)) errs.website = 'Must start with http:// or https://'
    if (description.length > 2000) errs.description = 'At most 2000 characters'
    setErrors(errs)
    if (!parsed.success || Object.keys(errs).length) return
    setBusy(true); setNotice(null)
    try {
      const d = parsed.data
      await updateOrganizationPublic(orgId, { org_type: d.org_type, city: d.city, phone: d.phone, official_email: d.official_email, description: description || null, website: website || null })
      await saveOrgPrivate(orgId, { address: d.address, registration_id: d.registration_id, representative_name: d.representative_name, representative_role: d.representative_role, verification_docs: priv.data?.verification_docs ?? [] })
      setNotice({ tone: 'success', text: 'Saved.' }); reload(); await refresh()
    } catch (err) {
      setNotice({ tone: 'error', text: toAppError(err).message })
    } finally {
      setBusy(false)
    }
  }
  async function upload(kind: 'logo' | 'doc', file: File | undefined) {
    if (!file) return
    setNotice(null)
    try {
      if (kind === 'logo') {
        const url = await uploadImage(orgId, file)
        await updateOrganizationPublic(orgId, { logo_url: url })
      } else {
        const docs = priv.data?.verification_docs ?? []
        if (docs.length >= 5) throw new Error('At most 5 documents.')
        const path = await uploadVerificationDoc(orgId, file)
        await saveOrgPrivate(orgId, {
          address: priv.data?.address ?? null, registration_id: priv.data?.registration_id ?? null,
          representative_name: priv.data?.representative_name ?? null, representative_role: priv.data?.representative_role ?? null,
          verification_docs: [...docs, path],
        })
      }
      setNotice({ tone: 'success', text: kind === 'logo' ? 'Logo updated.' : 'Document uploaded. Platform administrators can now review it.' }); reload()
    } catch (err) {
      setNotice({ tone: 'error', text: toAppError(err).message })
    }
  }

  if (org.isPending || priv.isPending) return <LoadingState />
  if (org.isError) return <ErrorState message={toAppError(org.error).message} onRetry={() => org.refetch()} />
  const o = org.data, p = priv.data
  return (
    <>
      <PageHeader title="Profile & verification" subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={o.status} /> {o.name}</span>} />
      {o.status === 'pending' && <div className="mb-4"><Alert tone="warning">Pending verification. Complete the details below and upload registration documents so administrators can verify you. Until then you can prepare drafts but cannot publish.</Alert></div>}
      <div aria-live="polite">{notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}</div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate key={o.created_at + (p?.org_id ?? '')}>
            <h2 className="font-semibold">Public details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Organization type" name="org_type" defaultValue={o.org_type} options={ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABELS[t] }))} />
              <TextField label="City" name="city" defaultValue={o.city ?? ''} error={errors.city} />
              <TextField label="Official email" name="official_email" type="email" defaultValue={o.official_email ?? ''} error={errors.official_email} />
              <TextField label="Phone" name="phone" type="tel" defaultValue={o.phone ?? ''} error={errors.phone} />
            </div>
            <TextField label="Website" name="website" defaultValue={o.website ?? ''} placeholder="https://" error={errors.website} />
            <TextArea label="Description" name="description" defaultValue={o.description ?? ''} error={errors.description} />
            <h2 className="mt-2 font-semibold">Private verification details <span className="text-sm font-normal text-ink-500">(visible to your team and Worldkin administrators only)</span></h2>
            <TextField label="Registered address" name="address" defaultValue={p?.address ?? ''} error={errors.address} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Registration ID (if any)" name="registration_id" defaultValue={p?.registration_id ?? ''} error={errors.registration_id} />
              <TextField label="Representative name" name="representative_name" defaultValue={p?.representative_name ?? ''} error={errors.representative_name} />
              <TextField label="Representative role" name="representative_role" defaultValue={p?.representative_role ?? ''} error={errors.representative_role} />
            </div>
            <div><Button type="submit" busy={busy}>Save details</Button></div>
          </form>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Logo</h2>
            <div className="flex items-center gap-3">
              <OrgLogo name={o.name} url={o.logo_url} size={64} />
              <label className="text-sm">
                <span className="mb-1 block font-medium">Upload (PNG/JPEG/WebP, ≤ 2 MB)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload('logo', e.currentTarget.files?.[0])} />
              </label>
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Verification documents</h2>
            {(p?.verification_docs ?? []).length === 0 ? <p className="text-sm text-ink-500">None uploaded yet.</p> : (
              <ul className="mb-2 flex flex-col gap-1 text-sm">
                {p!.verification_docs.map((d) => <li key={d}><DocLink path={d} /></li>)}
              </ul>
            )}
            <label className="text-sm">
              <span className="mb-1 block font-medium">Add document (PDF/PNG/JPEG, ≤ 5 MB, max 5)</span>
              <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => void upload('doc', e.currentTarget.files?.[0])} />
            </label>
          </Card>
        </div>
      </div>
    </>
  )
}

/** Opens a private document through a short-lived signed URL. */
export function DocLink({ path }: { path: string }) {
  const [err, setErr] = useState<string | null>(null)
  return (
    <span>
      <button type="button" className="text-brand-700 underline" onClick={async () => {
        try { window.open(await signedDocUrl(path), '_blank', 'noopener') } catch (e) { setErr(toAppError(e).message) }
      }}>{path.split('/').pop()?.replace(/^\d+-/, '')}</button>
      {err && <span className="ml-2 text-xs text-rose-700">{err}</span>}
    </span>
  )
}
