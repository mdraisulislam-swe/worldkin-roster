# Email verification code (OTP) — setup and test guide

## How it works

1. `/join` → Volunteer or Organization → `/signup?as=…` (name, email, password).
2. `supabase.auth.signUp` creates the Auth user with metadata `{ full_name, signup_intent }`.
   The `on_auth_user_created` trigger creates exactly one `profiles` row (primary key = user id, so retries cannot duplicate it). Roles in metadata are ignored by the trigger, so nobody can sign themselves up as an admin; `signup_intent` only chooses the next screen.
3. Supabase sends the "Confirm signup" email containing only a 6-digit `{{ .Token }}` (no link, so the code is the only way to verify).
4. The app opens `/verify-email` (the address travels in router state / `sessionStorage`, never in the URL).
5. `supabase.auth.verifyOtp({ email, token, type: 'email' })` — Supabase checks the code, its expiry and one-time use, confirms the address and starts the session.
6. Next screen: volunteers → `/me/profile`; organizations → `/orgs/new` (organization **verification** by a platform admin is a separate, unchanged step).

Password recovery: `/forgot-password` → `resetPasswordForEmail` (same answer whether or not the account exists) → "Reset password" email link → `/auth/reset` → new password + confirm → `updateUser({ password })` → **signed out on every device** (`signOut({ scope: 'global' })`) → `/signin` with "Password updated. Sign in with your new password." It uses the recovery template, never the sign-up code, and no password is ever emailed.

If `/auth/reset` is not on the Redirect URL allow-list, Supabase falls back to the Site URL root. The app detects a recovery fragment (`type=recovery`) on any page and switches to `/auth/reset` before the router starts (`recoveryLandingPath` in `src/lib/authRedirect.ts`), so the reset form always appears.

Resending a code (`/signin` for an unverified account, or `/auth/confirmed` after an old link) sends a new **code** and opens `/verify-email`, where the 60-second cooldown applies. The next screen is the same whether or not the address has an account.

## Manual step (owner, Supabase Dashboard) — shared by Preview and Production

This changes the live email for every new sign-up, so it is a separate approval.

1. **Authentication → Email Templates → Confirm signup**
   - Subject: `Verify your email address | Worldkin Roster`
   - Body: paste `docs/auth/email-templates/confirm-signup.html`
2. **Authentication → Providers → Email**: keep *Confirm email* ON; check *Email OTP length* = **6** and *Email OTP expiration* = **3600** seconds (the email text says 60 minutes — change the text if you change the value).
3. Leave the *Reset password* template, SMTP and URL configuration as they are.

**Status (checked 2026-11-26 in Supabase auth logs):** the live template is still link-based. A new sign-up at 15:52 UTC was confirmed by a `GET /verify` link click (login method "implicit"), not by `verifyOtp`. Until step 1 is done, users who click the link skip the code screen, and on the Preview they end up signed in on Production (the link always returns to the Site URL).

4. **Authentication → URL Configuration → Redirect URLs**: make sure `https://worldkin-roster.vercel.app/**` is listed (covers `/auth/reset` and `/auth/confirmed`). The app copes without it (see above), but the explicit entry avoids the Site URL fallback.

**Limit:** the built-in Supabase mailer sends only a few emails per hour per project. For a public launch configure custom SMTP (not needed for the demo).

## Manual tests after the template is live (one real mailbox you control)

| # | Test | Expected |
|---|---|---|
| 1 | Volunteer sign-up | code email arrives, greeting uses your name; correct code → "Email verified" → `/me/profile` |
| 2 | Organization sign-up | same, then `/orgs/new`; organization shows **Pending** until an admin verifies it |
| 3 | Wrong code | "That code is incorrect or has expired…"; field clears |
| 4 | Resend | button disabled for 60 s; new email; only the newest code works |
| 5 | Re-use a used code | rejected; "If you already verified this address, sign in instead" |
| 6 | Sign in before verifying | "Please verify your email address first" + **Enter verification code** button |
| 7 | Sign up again with a verified email | no new email; the page never says whether the account exists |
| 8 | Forgot password → link → new password → sign in | works exactly as before |
| 9 | Profiles | `select count(*) from profiles where id = '<user id>'` = 1; `platform_role` = volunteer |
