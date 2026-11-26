import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, LoadingState, PasswordField, TextField } from '../components/ui'
import { OTP_LENGTH, clearPendingSignup, cooldownLeft, isCompleteOtp, maskEmail, normalizeOtp, readPendingSignup, savePendingSignup } from '../lib/otp'
import { useNow } from '../lib/useNow'
import { toAppError } from '../lib/errors'
import { RESET_PATH, authRedirectMessage, newPasswordErrors, hasAuthFragment, readAuthRedirectError, safeNext, type AuthRedirectError } from '../lib/authRedirect'
import { fieldErrors, signInSchema, signUpSchema } from '../lib/validation'
import { supabase } from '../lib/supabase'
import { OtpInput } from '../components/OtpInput'
import { AuthFrame } from '../components/AuthFrame'
import { Icon } from '../components/Icon'
import { dashboardPath } from '../lib/dashboard'

/**
 * Sends a new confirmation email. The reply is the same whether or not the
 * address has an account, so this form cannot be used to discover users.
 */
function ResendConfirmation({ defaultEmail = '' }: { defaultEmail?: string }) {
  const { resendConfirmation } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Same next step whether or not the address has an account (no account discovery).
  const toCodeScreen = (email: string, sentAt: number) => {
    const pending = { email, next: '/dashboard', sentAt }
    savePendingSignup(pending)
    navigate('/verify-email', { state: pending })
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const email = String(new FormData(e.currentTarget).get('resendEmail') ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address')
    setError(null); setBusy(true)
    try {
      await resendConfirmation(email)
      toCodeScreen(email, Date.now())
    } catch (err) {
      const e2 = toAppError(err)
      // Only surface errors that do not reveal whether the account exists.
      if (e2.code === 'AUTH_RATE_LIMIT' || e2.code === 'NETWORK') setError(e2.message)
      else toCodeScreen(email, Date.now())
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
      <TextField label="Email for a new verification code" name="resendEmail" type="email" autoComplete="email" defaultValue={defaultEmail} error={error ?? undefined} />
      <Button type="submit" variant="secondary" busy={busy}>Send a new 6-digit code</Button>
    </form>
  )
}

export function SignInPage() {
  const { session, signIn } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const notice = (useLocation().state as { notice?: string } | null)?.notice
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
    <AuthFrame>
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Sign in</h1>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {notice && !formError && <Alert tone="success">{notice}</Alert>}
          {formError && <Alert tone="error">{formError.message}</Alert>}
          <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
          <PasswordField label="Password" name="password" autoComplete="current-password" error={errors.password} />
          <Button type="submit" busy={busy}>Sign in</Button>
        </form>
        {formError?.unconfirmed && (
          <div className="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-4">
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
    </AuthFrame>
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
    <AuthFrame>
      <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">{asOrg ? 'Register your organization' : 'Create your volunteer account'}</h1>
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
          <p className="text-xs text-ink-500">We will email you a 6-digit code to verify that this address is yours.</p>
        </form>
      </Card>
      <p className="mt-4 text-sm text-ink-500">Already registered? <Link className="text-brand-700 underline" to="/signin">Sign in</Link>
        {' · '}<Link className="text-brand-700 underline" to={asOrg ? '/signup?as=volunteer' : '/signup?as=organization'}>{asOrg ? 'Join as a volunteer instead' : 'Registering an organization?'}</Link></p>
    </AuthFrame>
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{info.title}</h1>
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Email confirmed</h1>
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
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Confirm your email</h1>
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
      <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">Join Worldkin Roster</h1>
      <p className="mb-6 text-ink-700">How would you like to take part?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/signup?as=volunteer" className="group rounded-2xl border border-neutral-100 bg-white p-6 shadow-[0_1px_2px_rgba(20,26,34,0.04)] transition-colors hover:border-brand-600">
          <span aria-hidden className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon name="user" /></span>
          <span className="flex items-center justify-between font-display text-lg font-bold text-ink-900">Join as a volunteer <Icon name="chevron-right" size={18} className="text-ink-500 group-hover:text-brand-700" /></span>
          <span className="mt-1 block text-sm text-ink-700">Find opportunities, apply, receive offers, join shifts and build a verified record of your hours.</span>
        </Link>
        <Link to="/signup?as=organization" className="group rounded-2xl border border-neutral-100 bg-white p-6 shadow-[0_1px_2px_rgba(20,26,34,0.04)] transition-colors hover:border-brand-600">
          <span aria-hidden className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-terracotta-500/10 text-terracotta-700"><Icon name="building" /></span>
          <span className="flex items-center justify-between font-display text-lg font-bold text-ink-900">Join as an organization <Icon name="chevron-right" size={18} className="text-ink-500 group-hover:text-brand-700" /></span>
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
    <AuthFrame>
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Reset your password</h1>
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
    </AuthFrame>
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
    const errs = newPasswordErrors(password, confirm)
    setErrors(errs)
    if (Object.keys(errs).length || !supabase) return
    setBusy(true); setFormError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw toAppError(error)
      setDone(true)
      // Sign out everywhere (revokes every refresh token for this user), then sign in manually.
      await supabase.auth.signOut({ scope: 'global' }).catch(() => supabase?.auth.signOut({ scope: 'local' }))
      navigate('/signin', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } })
    } catch (err) {
      setFormError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (redirectError) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">This reset link has expired or was already used</h1>
        <Alert tone="warning">Request a new password reset link.</Alert>
        <Link to="/forgot-password" className="text-sm text-brand-700 underline">Request a new link</Link>
      </div>
    )
  }
  if (loading) return <LoadingState label="Checking your reset link" />
  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Set a new password</h1>
        <Alert tone="info">Open the reset link from your email to continue.</Alert>
        <Link to="/forgot-password" className="text-sm text-brand-700 underline">Request a reset link</Link>
      </div>
    )
  }
  return (
    <AuthFrame>
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Set a new password</h1>
      <Card>
        {done ? <Alert tone="success">Password updated. Taking you to sign in…</Alert> : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}
            <PasswordField label="New password" name="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password} />
            <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
            <Button type="submit" busy={busy}>Update password</Button>
          </form>
        )}
      </Card>
    </AuthFrame>
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
  const [codeInvalid, setCodeInvalid] = useState(false)
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

  // Verified only when Supabase accepts the code (verifyOtp type 'email'); never assumed client-side.
  async function verify(value: string) {
    if (busy) return
    const target = (pending?.email ?? email).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return setNotice({ tone: 'error', text: 'Enter the email address you registered with.' })
    if (!isCompleteOtp(value)) return setNotice({ tone: 'error', text: `Enter the ${OTP_LENGTH}-digit code from the email.` })
    setBusy(true); setNotice(null); setCodeInvalid(false)
    try {
      await verifySignupCode(target, value)
      clearPendingSignup()
      setDone(true)
    } catch (err) {
      const e2 = toAppError(err)
      // Supabase reports wrong and expired codes with the same error, so the message covers both.
      setNotice({ tone: 'error', text: e2.code === 'AUTH_OTP_INVALID'
        ? 'That code is incorrect or has expired. Codes expire after 60 minutes and only the newest one works — check your latest email or press "Resend code". If you already verified this address, sign in instead.'
        : e2.message })
      setCodeInvalid(e2.code === 'AUTH_OTP_INVALID')
      setCode('')
      // After the boxes are re-enabled (busy=false below), return focus to the first box.
      setTimeout(() => (document.querySelector('input[name="code"]') as HTMLInputElement | null)?.focus(), 60)
    } finally {
      setBusy(false)
    }
  }
  function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void verify(code)
  }
  const changeEmailTo = next.startsWith('/orgs/new') ? '/signup?as=organization' : '/signup?as=volunteer'

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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Email verified</h1>
        <Alert tone="success">Welcome to Worldkin Roster{pending?.name ? `, ${pending.name}` : ''}! Your account is active. Taking you to the next step…</Alert>
        <Link className="text-sm text-brand-700 underline" to={next}>Continue now</Link>
      </div>
    )
  }
  return (
    <AuthFrame>
      <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">Verify your email</h1>
      <p className="mb-6 text-sm text-ink-700">
        {pending?.name ? <>Welcome, {pending.name}! </> : null}
        {pending?.email
          ? <>We sent a {OTP_LENGTH}-digit verification code to <strong>{maskEmail(pending.email)}</strong>. Enter it below to activate your account.</>
          : <>Enter the email you registered with and the {OTP_LENGTH}-digit code from your verification email.</>}
      </p>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={onVerify} noValidate>
          <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
          {!pending?.email && <TextField label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />}
          <div>
            <p id="otp-label" className="mb-2 text-sm font-medium text-ink-900">Verification code</p>
            <OtpInput value={code} onChange={(v) => { setCode(normalizeOtp(v)); setCodeInvalid(false) }} onComplete={(v) => void verify(v)}
              disabled={busy} invalid={codeInvalid} describedBy="otp-hint" />
            <p id="otp-hint" className="mt-2 text-xs text-ink-500">Type or paste the code — it checks automatically when all {OTP_LENGTH} digits are in.</p>
          </div>
          <Button type="submit" busy={busy} disabled={!isCompleteOtp(code)}>{busy ? 'Verifying…' : 'Verify email'}</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4 text-sm">
          <span className="text-ink-500">Didn’t get it? Check spam, or</span>
          <Button variant="ghost" onClick={onResend} disabled={wait > 0 || busy} aria-live="polite">
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </Button>
        </div>
      </Card>
      <p className="mt-4 text-sm text-ink-500">
        Wrong address? <Link className="text-brand-700 underline" to={changeEmailTo} onClick={() => clearPendingSignup()}>Change email</Link>
        {' · '}<Link className="text-brand-700 underline" to="/signin">Sign in</Link>
      </p>
    </AuthFrame>
  )
}
