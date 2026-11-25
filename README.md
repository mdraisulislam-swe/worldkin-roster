# Worldkin Roster — Everyone is kin.

A volunteer mobilization platform: verified organizations publish shifts, volunteers anywhere join them, and every seat, waitlist place and verified hour is decided safely inside the database.

**HACK THE VIBE 2026** · Track: World Problem Solver · Advanced challenges: **A05 Concurrency & Transactions**, **A03 Advanced Security & Access Control**

- Live: https://worldkin-roster.vercel.app
- Requirement coverage with evidence: [`docs/REQUIREMENTS_COVERAGE.md`](docs/REQUIREMENTS_COVERAGE.md)
- Test results (local and live): [`docs/TESTING.md`](docs/TESTING.md)

## The problem

When a disaster or a food drive needs people, coordinators juggle spreadsheets and chat groups: shifts overfill, the same person books two places at once, no-shows go unrecorded, and volunteers cannot prove the hours they gave. Worldkin Roster turns that into one reliable roster.

## Three modules

| Module | Who | What they can do |
|---|---|---|
| Volunteer | anyone who signs up | search and filter opportunities, join a shift or its waitlist, cancel, add to calendar, see a verified record of hours by cause |
| Organization | org admins and coordinators | create an organization (reviewed before going live), invite team members by consent, publish opportunities and shifts, change capacity, manage the roster, mark attendance, see a dashboard and audit log |
| Platform admin | Worldkin operators | verify, reject or suspend organizations with a reason, read the platform audit log |

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

### A03 — security and access control
- Five layers: column grants → RLS → definer RPCs → guard triggers → constraints.
- No API role can write roles, organization status, capacity, signups, attendance or audit rows directly.
- No self-verification of hours (RPC check **and** CHECK constraint); platform admins cannot review their own organization.
- Consent-based invites that do not reveal whether an email is registered.
- Proven live: 36 checks across anonymous, volunteer, coordinator and org-admin roles.

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
| `docs/` | blueprint, database design, testing evidence, requirement coverage |

## Known limitations

- Email delivery uses Supabase's built-in mailer (rate limited); production use needs a custom SMTP provider.
- Notifications, chat, payments and maps are out of scope for this MVP.
