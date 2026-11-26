# Email delivery: findings and setup (no custom domain)

Audit date: 26 Nov 2026. Supabase project `ekkvwgohpzliwbmjnrth`.

## What the audit found

1. **The test sign-ups never asked Supabase to send an email.** The Auth logs show four `/signup` calls on 25–26 Nov. Every one was logged as `user_repeated_signup` against two addresses whose accounts were already confirmed on 24 Nov. In that situation Supabase deliberately sends nothing and still answers HTTP 200, so that the response does not reveal whether an account exists. The app then wrongly said "We sent a code". **Fixed in this branch** (see "App changes").
2. **The built-in Supabase mailer cannot be used for public sign-ups.** With no custom SMTP configured, it only delivers to the email addresses of members of the project's Supabase organization, and only a few emails per hour. Strangers registering on the live site get nothing.
3. **Resend is not usable without a domain.** On the connected account, Resend reports 0 domains, 0 API keys and 0 emails ever sent. Without a verified domain, Resend only allows the test sender `onboarding@resend.dev`, and only to the account owner's own address. A `*.vercel.app` subdomain cannot be verified, because DNS for it is controlled by Vercel.

## Provider decision

| Option | Arbitrary Gmail recipients? | Domain needed? | Verdict |
|---|---|---|---|
| Supabase built-in mailer | No (team members only) | No | Testing only |
| Resend (current account) | No (owner's address only) | Yes | Not viable under the no-domain rule |
| **Gmail SMTP with an App Password** | **Yes** (about 500 recipients/day) | **No** | **Selected** |

Gmail SMTP sends from the owner's own Gmail address. Google signs that mail itself, so it passes Gmail's SPF and DKIM checks. This is suitable for a hackathon or a pilot. For real volume, add a domain later and switch to Resend.

## Owner setup (Dashboard; the password never goes through chat or Git)

1. Google Account → Security: turn on **2-Step Verification**, then create an **App password** (for example, named "Worldkin Supabase").
2. Supabase Dashboard → Authentication → **Emails → SMTP Settings** → enable custom SMTP:
   - Sender email: your Gmail address. Sender name: `Worldkin Roster`.
   - Host `smtp.gmail.com`, port `465`, username: your full Gmail address, password: the 16-character App password.
3. Authentication → **Emails → Templates → Confirm signup**:
   - Subject: `Confirm your email | Worldkin Roster`
   - Body: paste `docs/auth/email-templates/confirm-signup.html`
4. Authentication → **Rate Limits**: the email limit for custom SMTP can stay at its default (about 30 per hour) for the demo.
5. Leave **Confirm email** turned on.

Check: Authentication → URL Configuration must still list `https://worldkin-roster.vercel.app/**` under Redirect URLs. The confirmation link returns to `/auth/confirmed`.

## App changes on this branch

- A sign-up that hits an already-registered address no longer pretends that an email was sent. It says the address is already registered and offers **Sign in** or **Reset password**. Supabase's own API response already reveals this to any client, so the UI exposes nothing new.
- Link-first copy: the email's main action is the **Confirm my email** button. The 6-digit code stays as a backup on `/verify-email`.
- After confirmation, users are routed by intent:
  - Volunteers: `/auth/confirmed` → `/me/profile`.
  - Organizations: `/auth/confirmed` → `/orgs/new`.
  - The intent only chooses the next page. Roles still come from the database, and organizations still need platform verification before they can publish.

## Test plan after SMTP is enabled (one email per account type)

1. Open `/signup?as=volunteer` and register with a fresh Gmail address (or a `+volunteer` alias). The email should arrive from your Gmail. Click **Confirm my email**: you should land on `/auth/confirmed` and then `/me/profile`.
2. Open `/signup?as=organization` and register with a second fresh address. Click the link: you should end up at `/orgs/new`.
3. Open an already-used link again. It should show "link expired / already used" with a resend option.
4. Register the same address again. It should show "already registered", and no email is sent.
5. Sign out, then sign in again. Each account should land on its own dashboard.
