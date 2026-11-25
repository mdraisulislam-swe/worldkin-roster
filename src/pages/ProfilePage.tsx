import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { updateProfile } from '../lib/api'
import { toAppError } from '../lib/errors'
import { fieldErrors, profileSchema } from '../lib/validation'
import { Alert, Button, Card, LoadingState, PageHeader, TextArea, TextField } from '../components/ui'

export function ProfilePage() {
  const { session, profile, refresh } = useAuth()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!profile) return <LoadingState label="Loading profile" />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = profileSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setBusy(true); setNotice(null)
    try {
      // Only safe columns are sent; platform_role is not writable by API roles at all.
      await updateProfile(session!.user.id, parsed.data)
      await refresh()
      setNotice({ tone: 'success', text: 'Profile saved.' })
    } catch (err) {
      setNotice({ tone: 'error', text: toAppError(err).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" subtitle={<>Signed in as {session?.user.email} · role: {profile.platform_role === 'platform_admin' ? 'platform admin' : 'volunteer'}</>} />
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
          <TextField label="Full name" name="full_name" defaultValue={profile.full_name} error={errors.full_name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Country code" name="country_code" defaultValue={profile.country_code ?? ''} maxLength={2} hint="2 letters, e.g. BD" error={errors.country_code} />
            <TextField label="City" name="city" defaultValue={profile.city ?? ''} error={errors.city} />
          </div>
          <TextField label="Skills" name="skills" defaultValue={profile.skills.join(', ')} hint="Comma-separated, e.g. first aid, logistics. Some opportunities require a matching skill." error={errors.skills} />
          <TextArea label="About you" name="bio" defaultValue={profile.bio ?? ''} error={errors.bio} />
          <div><Button type="submit" busy={busy}>Save profile</Button></div>
        </form>
      </Card>
    </div>
  )
}
