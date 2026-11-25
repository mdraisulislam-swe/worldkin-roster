import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, TextField } from '../components/ui'
import { toAppError } from '../lib/errors'
import { fieldErrors, signInSchema, signUpSchema } from '../lib/validation'

function safeNext(next: string | null): string {
  // only same-site relative paths (prevents open redirects)
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/me'
}

export function SignInPage() {
  const { session, signIn } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const next = safeNext(params.get('next'))
  if (session) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = signInSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setFormError(null); setBusy(true)
    try {
      await signIn(parsed.data.email, parsed.data.password)
      navigate(next, { replace: true })
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" error={errors.password} />
          <Button type="submit" busy={busy}>Sign in</Button>
        </form>
      </Card>
      <p className="mt-4 text-sm text-ink-500">New here? <Link className="text-brand-700 underline" to="/signup">Create an account</Link></p>
    </div>
  )
}

export function SignUpPage() {
  const { session, signUp } = useAuth()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  if (session) return <Navigate to="/me" replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setFormError(null); setBusy(true)
    try {
      const { needsConfirmation } = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName)
      setDone(needsConfirmation)
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <Alert tone="success">Check your inbox and confirm your email address, then sign in.</Alert>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Create your volunteer account</h1>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Full name" name="fullName" autoComplete="name" error={errors.fullName} />
          <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
          <TextField label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password} />
          <Button type="submit" busy={busy}>Create account</Button>
        </form>
      </Card>
      <p className="mt-4 text-sm text-ink-500">Already registered? <Link className="text-brand-700 underline" to="/signin">Sign in</Link></p>
    </div>
  )
}
