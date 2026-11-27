import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Constants } from '../lib/database.types'
import { toAppError } from '../lib/errors'
import { CAUSE_LABELS, slugify } from '../lib/format'
import { fieldErrors, organizationDetailsSchema, organizationSchema } from '../lib/validation'
import { ORG_TYPES, ORG_TYPE_LABELS, createOrganizationFull } from '../lib/platform'
import { Alert, Button, Card, EmptyState, PageHeader, Select, StatusBadge, TextArea, TextField } from '../components/ui'

export function MyOrgsPage() {
  const { memberships } = useAuth()
  return (
    <>
      <PageHeader title="Organizations" subtitle="Organizations you administer or coordinate."
        actions={<Link to="/orgs/new" className="rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800">Register an organization</Link>} />
      {memberships.length === 0 ? (
        <EmptyState title="You are not part of any organization yet">
          Register your organization, or accept an invite from an organization admin (invites appear on My shifts).
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {memberships.map((m) => (
            <li key={m.org_id}>
              <Card className="flex items-center justify-between gap-3">
                <div>
                  <Link className="font-medium hover:underline" to={`/org/${m.org_id}`}>{m.organization?.name ?? 'Organization'}</Link>
                  <p className="text-sm text-ink-500">{m.role === 'org_admin' ? 'Organization admin' : 'Coordinator'}</p>
                </div>
                {m.organization && <StatusBadge status={m.organization.status} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function OrgCreatePage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [slug, setSlug] = useState('')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const raw = Object.fromEntries(new FormData(e.currentTarget))
    const parsed = organizationSchema.safeParse(raw)
    const details = organizationDetailsSchema.safeParse(raw)
    if (!parsed.success || !details.success) {
      return setErrors({ ...(details.success ? {} : fieldErrors(details.error)), ...(parsed.success ? {} : fieldErrors(parsed.error)) })
    }
    setErrors({}); setFormError(null); setBusy(true)
    try {
      const orgId = await createOrganizationFull({ ...parsed.data, ...details.data })
      await refresh()
      // Next step: logo and verification documents.
      navigate(`/org/${orgId}/settings`)
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Register an organization" subtitle="Step 2 of 2. New organizations start as pending until a Worldkin administrator verifies them; you become the organization admin. Next you can upload a logo and verification documents." />
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Organization name" name="name" error={errors.name}
            onChange={(e) => setSlug(slugify(e.currentTarget.value))} />
          <TextField label="Short name (slug)" name="slug" value={slug} onChange={(e) => setSlug(e.currentTarget.value)}
            hint="Lowercase letters, numbers and hyphens" error={errors.slug} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Main cause" name="cause" defaultValue="humanitarian" error={errors.cause}
              options={Constants.public.Enums.cause_category.map((c) => ({ value: c, label: CAUSE_LABELS[c] }))} />
            <TextField label="Country code" name="country_code" maxLength={2} placeholder="BD" error={errors.country_code} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Organization type" name="org_type" defaultValue="ngo" error={errors.org_type}
              options={ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABELS[t] }))} />
            <TextField label="City (optional)" name="city" error={errors.city} />
            <TextField label="Official email (optional)" name="official_email" type="email" error={errors.official_email} />
            <TextField label="Phone (optional)" name="phone" type="tel" placeholder="+880 1700 000000" error={errors.phone} />
          </div>
          <TextField label="Website (optional)" name="website" placeholder="https://" error={errors.website} />
          <TextArea label="Description (optional)" name="description" error={errors.description} />
          <fieldset className="flex flex-col gap-4 rounded-md border border-black/10 p-3">
            <legend className="px-1 text-sm font-semibold">Verification details (private: your team and Worldkin administrators only)</legend>
            <TextField label="Registered address (optional)" name="address" error={errors.address} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Registration ID (if applicable)" name="registration_id" error={errors.registration_id} />
              <TextField label="Representative name" name="representative_name" error={errors.representative_name} />
              <TextField label="Representative role" name="representative_role" placeholder="e.g. Director" error={errors.representative_role} />
            </div>
          </fieldset>
          <div><Button type="submit" busy={busy}>Submit for verification</Button></div>
        </form>
      </Card>
    </div>
  )
}
