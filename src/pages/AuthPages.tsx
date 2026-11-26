import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, LoadingState, PasswordField, TextField } from '../components/ui'
import { OTP_LENGTH, clearPendingSignup, cooldownLeft, isCompleteOtp, maskEmail, normalizeOtp, readPendingSignup, savePendingSignup } from '../lib/otp'
import { useNow } from '../lib/useNow'
import { toAppError } from '../lib/errors'
import { authRedirectMessage, hasAuthFragment, readAuthRedirectError, safeNext, type AuthRedirectError } from '../lib/authRedirect'
import { fieldErrors, signInSchema, signUpSchema } from '../lib/validation'
import { supabase } from '../lib/supabase'
import { dashboardPath } from '../lib/dashboard'

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
    if (busy) return
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
  const next = safeNext(params.get('next'), '/dashboard')
  if (session) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
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
          <PasswordField label="Password" name="password" autoComplete="current-password" error={errors.password} />
          <Button type="submit" busy={busy}>Sign in</Button>
        </form>
        {formError?.unconfirmed && (
          <div className="mt-4 flex flex-col gap-3 border-t border-black/10 pt-4">
            <Button variant="secondary" onClick={() => {
              savePendingSignup({ email: formError.email, next, sentAt: 0 })
              navigate('/verify-email', { state: { email: formError.email, next } })
            }}>Enter verification code</Button>
            <ResendConfirmation defaultEmail={formError.email} />
          </div>
        )}
      </Card>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-ink-500">
        <span>New here? <Link className="text-brand-700 underline" to="/join">Create an account</Link></span>
        <Link className="text-brand-700 underline" to="/forgot-password">Forgot password?</Link>
      </p>
    </div>
  )
}

export function SignUpPage() {
  const { session, signUp } = useAuth()
  const [params] = useSearchParams()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const asOrg = params.get('as') === 'organization'
  const next = safeNext(params.get('next'), asOrg ? '/orgs/new' : '/me/profile')
  if (session) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({}); setFormError(null); setExisting(false); setBusy(true)
    try {
      const { needsConfirmation, alreadyRegistered } = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName, next, asOrg ? 'organization' : 'volunteer')
      if (alreadyRegistered) {
        setExisting(true)
        return
      }
      if (needsConfirmation) {
        // Email stays in this tab's memory/sessionStorage, never in the URL.
        const pending = { email: parsed.data.email, name: parsed.data.fullName, next, sentAt: Date.now() }
        savePendingSignup(pending)
        navigate('/verify-email', { state: pending })
      }
    } catch (err) {
      const e2 = toAppError(err)
      if (e2.code === 'EMAIL_DELIVERY') {
        const pending = { email: parsed.data.email, name: parsed.data.fullName, next, sentAt: 0 }
        savePendingSignup(pending)
        navigate('/verify-email', { state: { ...pending, deliveryFailed: true } })
        return
      }
      setFormError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">{asOrg ? 'Register your organization' : 'Create your volunteer account'}</h1>
      <p className="mb-6 text-sm text-ink-700">{asOrg
        ? 'Step 1 of 2: create the account of the person who will administer the organization. After confirming your email you will enter the organization details and verification documents. Organizations can publish opportunities only after Worldkin verifies them.'
        : 'Step 1 of 2: create your account. After confirming your email you can complete your volunteer profile — skills, languages, availability and more.'}
      </p>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          {existing && (
            <Alert tone="info">
              This email address is already registered, so no new email was sent.{' '}
              <Link className="underline" to="/signin">Sign in</Link> or{' '}
              <Link className="underline" to="/forgot-password">reset your password</Link>.
            </Alert>
          )}
          <TextField label={asOrg ? 'Your full name (representative)' : 'Full name'} name="fullName" autoComplete="name" error={errors.fullName} />
          <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
          <PasswordField label="Password" name="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password} />
          <Button type="submit" busy={busy}>Create account</Button>
          <p className="text-xs text-ink-500">We will email you a confirmation link (and a 6-digit code as a backup) to verify that this address is yours.</p>
        </form>
      </Card>
      <p className="mt-4 text-sm text-ink-500">Already registered? <Link className="text-brand-700 underline" to="/signin">Sign in</Link>
        {' · '}<Link className="text-brand-700 underline" to={asOrg ? '/signup?as=volunteer' : '/signup?as=organization'}>{asOrg ? 'Join as a volunteer instead' : 'Registering an organization?'}</Link></p>
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

/** Registration entry: choose a role. Choosing never grants privileges — organizations still need verification, and platform admins cannot register. */
export function JoinPage() {
  const { session } = useAuth()
  if (session) return <Navigate to="/dashboard" replace />
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold">Join Worldkin Roster</h1>
      <p className="mb-6 text-ink-700">How would you like to take part?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/signup?as=volunteer" className="rounded-lg border border-black/10 bg-white p-5 hover:border-brand-600">
          <span className="block text-lg font-semibold text-ink-900">Join as a volunteer</span>
          <span className="mt-1 block text-sm text-ink-700">Find opportunities, apply, receive offers, join shifts and build a verified record of your hours.</span>
        </Link>
        <Link to="/signup?as=organization" className="rounded-lg border border-black/10 bg-white p-5 hover:border-brand-600">
          <span className="block text-lg font-semibold text-ink-900">Join as an organization</span>
          <span className="mt-1 block text-sm text-ink-700">Register, get verified, publish opportunities, select volunteers and track attendance.</span>
        </Link>
      </div>
      <p className="mt-6 text-sm text-ink-500">Already have an account? <Link className="text-brand-700 underline" to="/signin">Sign in</Link></p>
    </div>
  )
}

/** After sign-in: platform admin → admin, organization staff → their organization, others → volunteer dashboard. */
export function DashboardRedirect() {
  const { loading, session, profile, memberships, isPlatformAdmin } = useAuth()
  if (!loading && !session) return <Navigate to="/signin" replace />
  if (loading || !profile) return <LoadingState label="Opening your dashboard" />
  const to = dashboardPath({ isPlatformAdmin, orgIds: memberships.map((m) => m.org_id), signupIntent: session?.user.user_metadata?.signup_intent })
  return <Navigate to={to} replace />
}

const RESET_PATH = '/auth/reset'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim()
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address')
    if (!supabase) return setError('The app is not configured.')
    setError(null); setBusy(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + RESET_PATH })
      const e2 = err ? toAppError(err) : null
      // Same answer whether or not the account exists (no user enumeration).
      if (e2 && (e2.code === 'AUTH_RATE_LIMIT' || e2.code === 'NETWORK')) setError(e2.message)
      else setSent(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Reset your password</h1>
      <Card>
        {sent ? (
          <Alert tone="success">If an account exists for this email, a password reset link is on its way. The link expires, so use it soon.</Alert>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <TextField label="Email" name="email" type="email" autoComplete="email" error={error ?? undefined} />
            <Button type="submit" busy={busy}>Send reset link</Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-sm text-ink-500"><Link className="text-brand-700 underline" to="/signin">Back to sign in</Link></p>
    </div>
  )
}

export function ResetPasswordPage() {
  const { loading, session } = useAuth()
  const navigate = useNavigate()
  const [redirectError] = useState<AuthRedirectError | null>(() => readAuthRedirectError(window.location.hash, window.location.search))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (hasAuthFragment(window.location.hash)) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password') ?? '')
    const confirm = String(f.get('confirm') ?? '')
    const errs: Record<string, string> = {}
    if (password.length < 8) errs.password = 'Password must be at least 8 characters'
    else if (password.length > 72) errs.password = 'Password is too long'
    if (confirm !== password) errs.confirm = 'Passwords do not match'
    setErrors(errs)
    if (Object.keys(errs).length || !supabase) return
    setBusy(true); setFormError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw toAppError(error)
      setDone(true)
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (redirectError) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">This reset link has expired or was already used</h1>
        <Alert tone="warning">Request a new password reset link.</Alert>
        <Link to="/forgot-password" className="text-sm text-brand-700 underline">Request a new link</Link>
      </div>
    )
  }
  if (loading) return <LoadingState label="Checking your reset link" />
  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <Alert tone="info">Open the reset link from your email to continue.</Alert>
        <Link to="/forgot-password" className="text-sm text-brand-700 underline">Request a reset link</Link>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Set a new password</h1>
      <Card>
        {done ? <Alert tone="success">Password updated. Taking you to your dashboard…</Alert> : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}
            <PasswordField label="New password" name="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password} />
            <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
            <Button type="submit" busy={busy}>Update password</Button>
          </form>
        )}
      </Card>
    </div>
  )
}

/**
 * Step 2 of registration: the 6-digit code Supabase Auth emailed. Supabase
 * generates, expires and validates the code; this page never stores or logs it.
 */
export function VerifyEmailPage() {
  const { session, verifySignupCode, resendConfirmation } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const now = useNow(1000)
  const fromState = (location.state ?? null) as { email?: string; name?: string; next?: string; sentAt?: number; deliveryFailed?: boolean } | null
  const [pending, setPending] = useState(() => (fromState?.email
    ? { email: fromState.email, name: fromState.name, next: safeNext(fromState.next ?? null, '/dashboard'), sentAt: fromState.sentAt ?? 0 }
    : readPendingSignup()))
  const [email, setEmail] = useState(pending?.email ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(() => (fromState?.deliveryFailed
    ? { tone: 'error', text: 'Your account request was received, but the verification email could not be sent right now. Press "Resend code" in a few minutes.' }
    : null))
  const wait = cooldownLeft(pending?.sentAt || null, now)
  const next = safeNext(pending?.next ?? null, '/dashboard')

  // The app shell moves focus to <main> after each navigation; put it on the code field afterwards.
  useEffect(() => {
    const t = setTimeout(() => (document.querySelector('input[name="code"]') as HTMLInputElement | null)?.focus(), 50)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate(next, { replace: true }), 1500)
      return () => clearTimeout(t)
    }
  }, [done, next, navigate])
  if (session && !done) return <Navigate to={next} replace />

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const target = (pending?.email ?? email).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return setNotice({ tone: 'error', text: 'Enter the email address you registered with.' })
    if (!isCompleteOtp(code)) return setNotice({ tone: 'error', text: `Enter the ${OTP_LENGTH}-digit code from the email.` })
    setBusy(true); setNotice(null)
    try {
      await verifySignupCode(target, code)
      clearPendingSignup()
      setDone(true)
    } catch (err) {
      const e2 = toAppError(err)
      setNotice({ tone: 'error', text: e2.code === 'AUTH_OTP_INVALID'
        ? 'That code is incorrect or has expired. Check the newest email, or request a new code. If you already verified this address, sign in instead.'
        : e2.message })
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function onResend() {
    const target = (pending?.email ?? email).trim()
    if (!target || wait > 0 || busy) return
    setBusy(true); setNotice(null)
    try {
      await resendConfirmation(target)
      const updated = { email: target, name: pending?.name, next, sentAt: Date.now() }
      savePendingSignup(updated); setPending(updated)
      setNotice({ tone: 'success', text: 'If this address has an unverified account, a new code is on its way. Only the newest code works.' })
    } catch (err) {
      const e2 = toAppError(err)
      if (e2.code === 'AUTH_RATE_LIMIT' || e2.code === 'NETWORK') setNotice({ tone: 'error', text: e2.message })
      else {
        // Same answer whether or not the account exists (no account discovery).
        const updated = { email: target, name: pending?.name, next, sentAt: Date.now() }
        savePendingSignup(updated); setPending(updated)
        setNotice({ tone: 'success', text: 'If this address has an unverified account, a new code is on its way. Only the newest code works.' })
      }
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Email verified</h1>
        <Alert tone="success">Welcome to Worldkin Roster{pending?.name ? `, ${pending.name}` : ''}! Your account is active. Taking you to the next step…</Alert>
        <Link className="text-sm text-brand-700 underline" to={next}>Continue now</Link>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">Verify your email</h1>
      <p className="mb-6 text-sm text-ink-700">
        {pending?.name ? <>Welcome, {pending.name}! </> : null}
        {pending?.email
          ? <>We sent a confirmation email to <strong>{maskEmail(pending.email)}</strong>. Open the <strong>Confirm my email</strong> button in it — or enter the {OTP_LENGTH}-digit code from the same email below.</>
          : <>Enter the email you registered with and the {OTP_LENGTH}-digit code from your confirmation email, or open the link in that email.</>}
      </p>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onVerify} noValidate>
          <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
          {!pending?.email && <TextField label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />}
          <TextField label="Verification code" name="code" value={code} autoFocus
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={OTP_LENGTH + 4}
            className="w-full rounded-md border border-black/20 bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.5em]"
            hint="Paste the whole code or type it — spaces and dashes are ignored."
            onChange={(e) => setCode(normalizeOtp(e.currentTarget.value))} />
          <Button type="submit" busy={busy} disabled={!isCompleteOtp(code)}>Verify email</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-4 text-sm">
          <span className="text-ink-500">Didn’t get it? Check spam, or</span>
          <Button variant="ghost" onClick={onResend} disabled={wait > 0 || busy} aria-live="polite">
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </Button>
        </div>
      </Card>
      <p className="mt-4 text-sm text-ink-500">
        Wrong address? <Link className="text-brand-700 underline" to="/join" onClick={() => clearPendingSignup()}>Start again</Link>
        {' · '}<Link className="text-brand-700 underline" to="/signin">Sign in</Link>
      </p>
    </div>
  )
}
