import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { toAppError } from '../lib/errors'
import { fieldErrors, volunteerProfileSchema } from '../lib/validation'
import { getMyPhone, saveMyPhone, updateProfileFull, uploadImage, type ProfileExtra } from '../lib/platform'
import { Alert, Button, Card, LoadingState, PageHeader, TextArea, TextField } from '../components/ui'
import { VolunteerNav } from '../components/DashboardNav'

/** Volunteer profile and account settings. Phone is stored privately (owner and platform admins only). */
export function ProfilePage() {
  const { session, profile, memberships, refresh } = useAuth()
  const uid = session!.user.id
  const qc = useQueryClient()
  const phone = useQuery({ queryKey: ['my-phone', uid], queryFn: () => getMyPhone(uid) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!profile || phone.isPending) return <LoadingState label="Loading profile" />
  const p = profile as typeof profile & ProfileExtra

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = volunteerProfileSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setBusy(true); setNotice(null)
    try {
      const { phone: newPhone, ...pub } = parsed.data
      // Only safe columns are sent; platform_role and suspension are not writable by API roles at all.
      await updateProfileFull(uid, pub)
      await saveMyPhone(uid, newPhone)
      await refresh()
      void qc.invalidateQueries({ queryKey: ['my-phone'] })
      setNotice({ tone: 'success', text: 'Profile saved.' })
    } catch (err) {
      setNotice({ tone: 'error', text: toAppError(err).message })
    } finally {
      setBusy(false)
    }
  }
  async function onPhoto(file: File | undefined) {
    if (!file) return
    setNotice(null)
    try {
      const url = await uploadImage(uid, file)
      await updateProfileFull(uid, { avatar_url: url })
      await refresh()
      setNotice({ tone: 'success', text: 'Photo updated.' })
    } catch (err) {
      setNotice({ tone: 'error', text: toAppError(err).message })
    }
  }

  return (
    <>
      <PageHeader title="Profile & settings" subtitle={<>Signed in as {session?.user.email} · {profile.platform_role === 'platform_admin' ? 'platform admin' : 'volunteer'}</>} />
      {memberships.length === 0 && <VolunteerNav />}
      {p.suspended_at && <div className="mb-4"><Alert tone="error">Your account is suspended{p.suspended_reason ? `: ${p.suspended_reason}` : ''}. You cannot join, apply or accept offers.</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
            <p className="text-sm text-ink-500">Fields marked (optional) can be left blank. Organizations you apply to see your profile but never your email or phone.</p>
            <TextField label="Full name" name="full_name" defaultValue={profile.full_name} autoComplete="name" error={errors.full_name} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Country code (optional)" name="country_code" defaultValue={profile.country_code ?? ''} maxLength={2} hint="2 letters, e.g. BD" error={errors.country_code} />
              <TextField label="City (optional)" name="city" defaultValue={profile.city ?? ''} error={errors.city} />
              <TextField label="Phone (optional, private)" name="phone" type="tel" autoComplete="tel" defaultValue={phone.data ?? ''} error={errors.phone} />
            </div>
            <TextField label="Skills (optional)" name="skills" defaultValue={profile.skills.join(', ')} hint="Comma-separated, e.g. first aid, logistics. Some opportunities require a matching skill." error={errors.skills} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Languages (optional)" name="languages" defaultValue={(p.languages ?? []).join(', ')} hint="Comma-separated" error={errors.languages} />
              <TextField label="Interests (optional)" name="interests" defaultValue={(p.interests ?? []).join(', ')} hint="Comma-separated, e.g. education, climate" error={errors.interests} />
            </div>
            <TextField label="Education (optional)" name="education" defaultValue={p.education ?? ''} error={errors.education} />
            <TextField label="Availability (optional)" name="availability" defaultValue={p.availability ?? ''} placeholder="e.g. weekends, weekday evenings" error={errors.availability} />
            <TextArea label="Experience (optional)" name="experience" defaultValue={p.experience ?? ''} error={errors.experience} />
            <TextArea label="About me (optional)" name="bio" defaultValue={profile.bio ?? ''} error={errors.bio} />
            <div><Button type="submit" busy={busy}>Save profile</Button></div>
          </form>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Profile photo (optional)</h2>
            <div className="flex items-center gap-3">
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" width={64} height={64} className="h-16 w-16 rounded-full border border-black/10 object-cover" />
                : <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-800">{profile.full_name.charAt(0).toUpperCase()}</span>}
              <label className="text-sm">
                <span className="mb-1 block font-medium">Upload (PNG/JPEG/WebP, ≤ 2 MB)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void onPhoto(e.currentTarget.files?.[0])} />
              </label>
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Account</h2>
            <ul className="flex flex-col gap-1 text-sm">
              <li><Link className="text-brand-700 underline" to="/forgot-password">Change password (email link)</Link></li>
              <li><Link className="text-brand-700 underline" to="/orgs/new">Register an organization</Link></li>
              <li><Link className="text-brand-700 underline" to="/me/complaints">Private complaints</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
