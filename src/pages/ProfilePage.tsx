import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { toAppError } from '../lib/errors'
import { fieldErrors, volunteerProfileSchema } from '../lib/validation'
import { getMyPhone, saveMyPhone, updateProfileFull, uploadImage, type ProfileExtra } from '../lib/platform'
import { Alert, Button, Card, LoadingState, PageHeader, TextArea, TextField } from '../components/ui'
import { Icon } from '../components/Icon'
import { maskEmail } from '../lib/otp'

/** Volunteer profile and account settings. Phone is stored privately (owner and platform admins only). */
export function ProfilePage() {
  const { session, profile, refresh } = useAuth()
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
    <div className="flex flex-col gap-6 [&>*:first-child]:mb-0">
      <PageHeader title="Profile & settings" subtitle="Organizations see this when you apply. Your phone stays private." />
      {p.suspended_at && <div><Alert tone="error">Your account is suspended, so you cannot join, apply or accept offers. The reason is in your <Link className="underline" to="/me/notifications">notifications</Link>.</Alert></div>}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="sm:p-7">
          {/* Prototype: photo row at the top of the profile form (upload is its own action, outside the form submit). */}
          <div className="mb-4 flex items-center gap-4">
            {p.avatar_url
              ? <img src={p.avatar_url} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full border border-neutral-100 object-cover" />
              : <span aria-hidden className="grid h-[72px] w-[72px] place-items-center rounded-full bg-brand-50 font-display text-2xl font-bold text-brand-700">{profile.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}</span>}
            <div className="flex flex-col gap-1">
              <label className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-[#d5d9d2] bg-white px-3 text-sm font-semibold text-ink-900 hover:border-brand-600 focus-within:ring-3 focus-within:ring-brand-600/25">
                <Icon name="user" size={16} />Upload photo
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onPhoto(e.currentTarget.files?.[0])} />
              </label>
              <span className="text-xs text-ink-500">PNG, JPG or WebP · up to 2 MB · optional</span>
            </div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Full name" name="full_name" defaultValue={profile.full_name} autoComplete="name" error={errors.full_name} />
              <TextField label="City (optional)" name="city" defaultValue={profile.city ?? ''} error={errors.city} />
            </div>
            <TextArea label="About you (optional)" name="bio" defaultValue={profile.bio ?? ''} error={errors.bio} />
            <TextField label="Skills (optional)" name="skills" defaultValue={profile.skills.join(', ')} hint="Comma-separated, e.g. first aid, logistics. Some opportunities require a matching skill." error={errors.skills} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Languages (optional)" name="languages" defaultValue={(p.languages ?? []).join(', ')} hint="Comma-separated" error={errors.languages} />
              <TextField label="Availability (optional)" name="availability" defaultValue={p.availability ?? ''} placeholder="e.g. weekends, weekday evenings" error={errors.availability} />
            </div>
            <TextField label="Phone (optional, private)" name="phone" type="tel" autoComplete="tel" defaultValue={phone.data ?? ''} error={errors.phone}
              hint="Only you and platform administrators can see this. Never shown to organizations." />
            {/* Fields beyond the prototype: shared with organizations when you apply. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Interests (optional)" name="interests" defaultValue={(p.interests ?? []).join(', ')} hint="Comma-separated, e.g. education, climate" error={errors.interests} />
              <TextField label="Country code (optional)" name="country_code" defaultValue={profile.country_code ?? ''} maxLength={2} hint="2 letters, e.g. BD" error={errors.country_code} />
            </div>
            <TextField label="Education (optional)" name="education" defaultValue={p.education ?? ''} error={errors.education} />
            <TextArea label="Experience (optional)" name="experience" defaultValue={p.experience ?? ''} error={errors.experience} />
            <div><Button type="submit" busy={busy}>Save profile</Button></div>
          </form>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 text-base font-semibold">Account</h2>
            <p className="text-sm text-ink-500">Sign-in email: {maskEmail(session?.user.email ?? '')}</p>
            <p className="mb-2 text-sm text-ink-500">Role: {profile.platform_role === 'platform_admin' ? 'platform admin' : 'volunteer'}</p>
            <ul className="flex flex-col gap-1 text-sm">
              <li><Link className="text-brand-700 underline" to="/forgot-password">Change password (email link)</Link></li>
              <li><Link className="text-brand-700 underline" to="/orgs/new">Register an organization</Link></li>
              <li><Link className="text-brand-700 underline" to="/me/complaints">Private complaints</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
