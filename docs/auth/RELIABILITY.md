# Authentication and email — failure behaviour

No hosted service is immune to outages; this page states what Worldkin Roster depends on and what users see when a dependency fails. It does not promise zero downtime.

## External dependencies

| Dependency | Used for | If it fails |
|---|---|---|
| Supabase Auth (GoTrue) | sign-up, verification code, sign-in, password reset, sessions | forms show a clear message; signed-in users keep their current session until it expires |
| Supabase email sender (built-in mailer, low hourly limit) | verification codes, password-reset links | sign-up still continues to the code page; "Resend code" is offered (see below) |
| Supabase Data API / PostgreSQL | all app data, RLS, RPCs | pages show "could not load" with a retry button; no partial writes (every RPC is one transaction) |
| Supabase Storage | profile photos, logos, verification documents | upload shows an error; the rest of the page keeps working |
| Vercel | serving the web app | site unavailable; nothing to do in the app |

## Safeguards in the app

| Failure | Behaviour |
|---|---|
| Hung request (outage, captive portal) | every Supabase request is aborted after 15 s (60 s for uploads) → "The service is taking too long to respond…" (`src/lib/net.ts`) |
| HTTP 429 / rate limits | "Too many attempts. Please wait a few minutes…" (no automatic retry) |
| Email could not be sent (SMTP/provider error) | sign-up still moves to `/verify-email` with a notice and an immediately available "Resend code" |
| Temporary 5xx | "The service is temporarily unavailable…" |
| Offline | a banner in the shell; queries refetch automatically when the connection returns |
| Auth unreachable at start-up | the session check finishes as signed out instead of spinning forever |
| Rendering error inside a page | route error page with a reload link; other routes are unaffected |
| Rendering error outside the router | `AppErrorBoundary` shows a reload screen (never a blank page) |
| Double clicks / Enter key | each auth form ignores new submits while one is in flight; buttons are disabled |
| Retries | reads retry at most once and only for transient errors; writes never retry automatically |
| Refresh / back / forward on the code page | pending email and resend cooldown are restored from `sessionStorage` |

The 60-second resend cooldown is a usability measure. Abuse protection comes from Supabase's server-side rate limits (and CAPTCHA, below), not from the browser.

## CAPTCHA recommendation (not enabled yet)

Public sign-up, password reset and resend are the endpoints bots target. Supabase Auth supports **hCaptcha** and **Cloudflare Turnstile** (Dashboard → Authentication → Bot and abuse protection).

Order matters — enabling it in the Dashboard first would block every sign-up:

1. Create a Turnstile (or hCaptcha) site key + secret.
2. Ship the client widget on `/signup`, `/signin`, `/forgot-password` and the resend action, passing `options.captchaToken` to `signUp`, `signInWithPassword`, `resetPasswordForEmail` and `resend`.
3. Deploy, then enable CAPTCHA in Supabase with the secret.
4. Test sign-up, sign-in, reset and resend.

This adds a third-party script and an extra step for users, so it is a product decision for after the hackathon; nothing in the current security model depends on it.

## Recovery steps for the owner

- **Emails not arriving:** check Supabase → Logs → Auth for send errors or rate limits; for production volume configure custom SMTP.
- **Auth outage:** nothing to change in the app; users can retry when Supabase status recovers.
- **Bad deployment:** promote the previous Vercel deployment (Deployments → ⋯ → Promote to Production).
