import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, LoadingState, TextField } from '../components/ui'
import { toAppError } from '../lib/errors'
import { authRedirectMessage, hasAuthFragment, readAuthRedirectError, safeNext, type AuthRedirectError } from '../lib/authRedirect'
import { fieldErrors, signInSchema, signUpSchema } from '../lib/validation'

/**
 * Sends a new confirmation email. The reply is the same whether or not the
 * address has an account, so this form cannot be used to discover users.
 */
function ResendConfirmation({ defaultEmail = '' }: { defaultEmail?: string }) {
  const { resendConfirmation } = useAuth()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('resendEmail') ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address')
    setError(null); setBusy(true)
    try {
      await resendConfirmation(email)
      setSent(true)
    } catch (err) {
      const e2 = toAppError(err)
      // Only surface errors that do not reveal whether the account exists.
      if (e2.code === 'AUTH_RATE_LIMIT' || e2.code === 'NETWORK') setError(e2.message)
      else setSent(true)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return <Alert tone="success">If this email has an unconfirmed account, a new confirmation link is on its way. Links expire, so use the newest one.</Alert>
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
      <TextField label="Email for a new confirmation link" name="resendEmail" type="email" autoComplete="email" defaultValue={defaultEmail} error={error ?? undefined} />
      <Button type="submit" variant="secondary" busy={busy}>Send a new confirmation link</Button>
    </form>
  )
}

export function SignInPage() {
  const { session, signIn } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<{ message: string; unconfirmed: boolean; email: string } | null>(null)
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
      const e2 = toAppError(err)
      setFormError({ message: e2.message, unconfirmed: e2.code === 'AUTH_UNCONFIRMED', email: parsed.data.email })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError.message}</Alert>}
          <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" error={errors.password} />
          <Button type="submit" busy={busy}>Sign in</Button>
        </form>
        {formError?.unconfirmed && <div className="mt-4 border-t border-black/10 pt-4"><ResendConfirmation defaultEmail={formError.email} /></div>}
      </Card>
      <p className="mt-4 text-sm text-ink-500">New here? <Link className="text-brand-700 underline" to="/signup">Create an account</Link></p>
    </div>
  )
}

export function SignUpPage() {
  const { session, signUp } = useAuth()
  const [params] = useSearchParams()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const next = safeNext(params.get('next'))
  if (session) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setFormError(null); setBusy(true)
    try {
      const { needsConfirmation } = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName, next)
      if (needsConfirmation) setSentTo(parsed.data.email)
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <Alert tone="success">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this or any device to activate your account.
        </Alert>
        <p className="text-sm text-ink-700">
          Already have an account with this email? No new email is sent in that case — <Link className="text-brand-700 underline" to="/signin">sign in</Link> instead.
        </p>
        <Card><ResendConfirmation defaultEmail={sentTo} /></Card>
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

/**
 * Landing page for the confirmation email link. supabase-js reads the session
 * from the URL fragment and clears it; this page reports the outcome, removes
 * any leftover auth data from the address bar and sends the user onward.
 */
export function AuthConfirmedPage() {
  const { loading, session } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  // Captured once on first render, before the fragment is cleared.
  const [redirectError] = useState<AuthRedirectError | null>(() => readAuthRedirectError(window.location.hash, window.location.search))

  useEffect(() => {
    if (hasAuthFragment(window.location.hash)) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    if (!redirectError && !loading && session) {
      const t = setTimeout(() => navigate(next, { replace: true }), 2500)
      return () => clearTimeout(t)
    }
  }, [redirectError, loading, session, next, navigate])

  if (redirectError) {
    const info = authRedirectMessage(redirectError)
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">{info.title}</h1>
        <Alert tone="warning">{info.message}</Alert>
        <Link to="/signin" className="text-sm text-brand-700 underline">Go to sign in</Link>
        {info.canResend && <Card><ResendConfirmation /></Card>}
      </div>
    )
  }
  if (loading) return <LoadingState label="Confirming your email" />
  if (session) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Email confirmed</h1>
        <Alert tone="success">Welcome to Worldkin Roster — you are signed in. Taking you onward…</Alert>
        <div className="flex gap-3">
          <Link to={next} className="text-sm text-brand-700 underline">Continue now</Link>
          <Link to="/explore" className="text-sm text-brand-700 underline">Explore opportunities</Link>
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Confirm your email</h1>
      <Alert tone="info">Open the link from your confirmation email to activate your account. If you already confirmed, sign in.</Alert>
      <Link to="/signin" className="text-sm text-brand-700 underline">Go to sign in</Link>
      <Card><ResendConfirmation /></Card>
    </div>
  )
}
