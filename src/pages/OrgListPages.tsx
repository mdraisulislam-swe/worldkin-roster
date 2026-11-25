import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { createOrganization } from '../lib/api'
import { Constants } from '../lib/database.types'
import { toAppError } from '../lib/errors'
import { CAUSE_LABELS, slugify } from '../lib/format'
import { fieldErrors, organizationSchema } from '../lib/validation'
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
    const parsed = organizationSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setFormError(null); setBusy(true)
    try {
      const orgId = await createOrganization(parsed.data)
      await refresh()
      navigate(`/org/${orgId}`)
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Register an organization" subtitle="New organizations start as pending until a platform administrator verifies them. You become its admin." />
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
          <TextField label="Website (optional)" name="website" placeholder="https://" error={errors.website} />
          <TextArea label="Description (optional)" name="description" error={errors.description} />
          <div><Button type="submit" busy={busy}>Submit for verification</Button></div>
        </form>
      </Card>
    </div>
  )
}
