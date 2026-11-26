# Worldkin Roster — Everyone is kin.

A volunteer mobilization platform: verified organizations publish shifts, volunteers anywhere join them, and every seat, waitlist place and verified hour is decided safely inside the database.

**HACK THE VIBE 2026** · Track: World Problem Solver · Advanced challenges: **A05 Concurrency & Transactions**, **A03 Advanced Security & Access Control**

- Live: https://worldkin-roster.vercel.app
- Requirement coverage with evidence: [`docs/REQUIREMENTS_COVERAGE.md`](docs/REQUIREMENTS_COVERAGE.md)
- Test results (local and live): [`docs/TESTING.md`](docs/TESTING.md)

## Deployment status (26 Nov 2026)

| Environment | Build | What it contains |
|---|---|---|
| Production — https://worldkin-roster.vercel.app | `main` @ `e616aad` | Core platform: verified organizations, opportunities, capacity-safe shifts with waitlist, attendance, verified hours, certificates, admin |
| Preview (Vercel, team-protected) | `feature/applications-platform` | Plus: applications → 72 h offers, complaints, feedback, notifications, experience passport, role dashboards, email-code verification, reliability layer |
| Database | wk01–wk07 applied | Shared by both environments; see `docs/REQUIREMENTS_COVERAGE.md` for live evidence |

The feature branch is merged to `main` only after a signed-in browser check of its Preview.

## The problem

When a disaster or a food drive needs people, coordinators juggle spreadsheets and chat groups: shifts overfill, the same person books two places at once, no-shows go unrecorded, and volunteers cannot prove the hours they gave. Worldkin Roster turns that into one reliable roster.

## Three modules

| Module | Who | What they can do |
|---|---|---|
| Volunteer | anyone who joins as a volunteer | rich profile (skills, languages, availability, photo; phone kept private), search and filter voluntary / stipend-based / paid opportunities, join open shifts or **apply**, accept or decline 72-hour **offers**, withdraw, notifications, verified hours, printable certificates, feedback after verified participation, private complaints |
| Organization | org admins and coordinators | register with contact details and private verification documents (pending until verified), publish opportunities with compensation and selection mode, review applicants (no contact data exposed), private review notes, select/reject, send/revoke offers for a specific shift, manage shifts, roster and attendance, dashboard, feedback, audit log |
| Platform admin | Worldkin operators (no public sign-up) | platform overview, verify/reject/suspend organizations after reviewing documents, suspend users, moderate opportunities and feedback, resolve private complaints, audit log. Today there is **one** admin role (`platform_admin`); splitting it into Super / Verification / Moderation admins is designed in [`docs/proposals/ADMIN_ROLES.md`](docs/proposals/ADMIN_ROLES.md) (migration not applied) |

## Core workflows

1. **Organization:** register → verify email (6-digit code) → add details and private documents → a platform admin verifies it → publish an opportunity with shifts, capacity, compensation and selection mode.
2. **Volunteer:** discover (search, filters, events) → open sign-up: join a shift, or full → FIFO waitlist · by application: apply → organization reviews → 72 h offer → accept (books the seat or the waitlist atomically) or decline.
3. **After the shift:** organization staff record attendance → verified hours (append-only) → certificate and experience passport; volunteer can leave feedback.
4. **Admin:** verify organizations, moderate, handle complaints, read the audit log.

Every state change above is a server-side RPC; the browser cannot set statuses, seats or hours directly.

## Architecture

```
React 19 + TypeScript (Vite, Tailwind v4, React Router, TanStack Query, zod)
        │  publishable key + user JWT only
        ▼
Supabase (PostgreSQL 17, Auth, Data API)
  • RLS on every table, column-level grants
  • SECURITY DEFINER RPCs are the only write path for seats, roles and attendance
  • guard triggers, constraints, append-only audit and participation records
```

The browser never holds a secret key; every permission is enforced by the database, so a modified client cannot bypass it.

### A05 — concurrency and transactions
- `join_shift` locks the volunteer row, then the shift row (`FOR UPDATE`), so seat decisions are serialized and there is no deadlock cycle.
- FIFO waitlist via an identity sequence; cancellation promotes the next person in the same transaction.
- Idempotency key (`UNIQUE(volunteer_id, idempotency_key)`) makes retries safe.
- Partial unique index: one active place per volunteer per shift. GiST exclusion constraint: no overlapping commitments, even across different shifts.
- Proven live: 10 parallel joins for 1 seat → exactly 1 confirmed, 3 waitlisted, 6 rejected (six runs).
- Offer acceptance books through the same core as joining, under the lock order volunteer → application → offer → shift → signup; acceptance is idempotent and an expired or revoked offer can never be accepted (expiry computed by the server).

### A03 — security and access control
- Five layers: column grants → RLS → definer RPCs → guard triggers → constraints.
- No API role can write roles, organization status, capacity, signups, attendance or audit rows directly.
- No self-verification of hours (RPC check **and** CHECK constraint); platform admins cannot review their own organization.
- Consent-based invites that do not reveal whether an email is registered.
- Proven live: security run 20 PASS + 1 SKIP (L19, needs the Founder's own sign-in), plus application-platform checks S1–S4 and L4–L7 and storage S14 (see `docs/TESTING.md`).

## Database migrations

Apply in filename order to the Worldkin project only (`supabase/migrations/`): wk01 types/tables · wk02 helpers/triggers · wk03 RLS/grants · wk04 RPCs · wk05 volunteer lock (deadlock fix) · **wk06 applications platform** · **wk07 storage buckets/policies**. All are additive.

Local verification without touching any project (PostgreSQL 17 in-process via PGlite; wk07 is skipped locally because PGlite has no storage schema):

```bash
node supabase/tests/local-pglite/tests.mjs supabase/migrations
node supabase/tests/local-pglite/wk06_tests.mjs supabase/migrations
```

## Run locally

Requirements: Node 20+ and access to the Worldkin Supabase project's **publishable** key.

```bash
npm install
cp .env.example .env.local   # then put the publishable key in .env.local (never a secret key)
npm run dev
```

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://ekkvwgohpzliwbmjnrth.supabase.co` (the app refuses any other project) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's `sb_publishable_…` key |

Checks: `npm run lint` · `npm test` · `npm run build`

## Deploy (Vercel)

Framework Vite, build `npm run build`, output `dist`. Set both variables above for **Production and Preview**, then redeploy (Vite embeds them at build time). `vercel.json` rewrites every non-asset path to `index.html` so direct links and refreshes work. In Supabase Auth → URL Configuration, set the Site URL to the production URL and add `https://<domain>/**` as a redirect URL.

## Repository map

| Path | Contents |
|---|---|
| `src/` | application (pages, auth guards, API layer, UI primitives) |
| `supabase/migrations/` | schema, RLS, RPCs, deadlock fix (applied in order) |
| `supabase/tests/` | live A03/A05 scripts and a local PostgreSQL 17 test harness |
| `supabase/seed/demo_seed.sql` | demo data, every record labelled "(Demo)" |
| `docs/` | blueprint, database design, testing evidence, requirement coverage, design system (`DESIGN_SYSTEM.md`), feature proposals awaiting approval (`proposals/`) |

## Known limitations

- Email: custom SMTP (Gmail) is configured in Supabase; Gmail limits volume (~500/day). Code-first verification needs the template in `docs/auth/email-templates/confirm-signup.html` pasted into the dashboard.
- Notifications are in-app only (no email/SMS). There is no chat or payment processing.
- **Map:** not implemented. Opportunities store city and country as text (search filters by them); a map needs coordinates and a map library — proposed in `docs/proposals/REVIEWS_AND_LOCATION.md` (wk12).
- **Admin roles:** one platform-admin role today (see above).
- Production (`main`) can lag the feature branch; see *Deployment status*.
- Compensation is information shown to volunteers; Worldkin does not process payments.
