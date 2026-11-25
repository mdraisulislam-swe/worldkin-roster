# Worldkin Roster — Requirement Coverage (HACK THE VIBE 2026)

Statuses: **Not Started** · **Implemented** (code exists) · **Tested Locally** (run on localhost or local PostgreSQL, may call the live database) · **Verified Live** (proven on the live Supabase project through its public API, or on the production URL).
A status is raised only with evidence; evidence IDs refer to [`TESTING.md`](TESTING.md).
Last updated: 25 Nov 2026.

## Mandatory requirements

| ID | Requirement | What Worldkin does | Status | Evidence | Gap / next step |
|---|---|---|---|---|---|
| M01 | Complete functional system | Three modules: **Volunteer** (discover → join/waitlist → cancel → hours record), **Organization** (onboarding, team, opportunities, shifts, roster, attendance, dashboard, audit), **Platform admin** (org review, suspension, platform audit) | Volunteer + Organization: **Tested Locally** · Admin: **Implemented** | TESTING §8 journeys (localhost against live DB) | Admin journey needs Founder sign-in; all three modules need re-running on the production URL once the key is fixed |
| M02 | Database integration & persistence | Supabase PostgreSQL 17: 9 tables, migrations wk01–wk05, generated TS types, every screen reads/writes through RLS or RPCs | **Verified Live** (database) · Frontend: **Tested Locally** | TESTING §2, §5, §6, §7 | Production frontend blocked by wrong `VITE_SUPABASE_PUBLISHABLE_KEY` on Vercel |
| M03 | Authentication & authorization | Email/password sign-up (email confirmation ON), sign-in, sign-out, persistent session, protected routes, `next=` return; roles volunteer / coordinator / org_admin / platform_admin enforced in the DB | Sign-in/out + authorization: **Verified Live** (API) · Sign-up UI: **Implemented** | TESTING §4 P0 (14 sign-ins), §6 L1–L18 | Sign-up on production currently fails with "Invalid API key" (env value, see §M08); test sign-up + email confirmation after the fix and after Auth Site URL is set |
| M04 | Complex business logic | Capacity + FIFO waitlist, automatic promotion, idempotent joins, no overlapping commitments, skill eligibility, time frozen after signups, attendance without self-verification, org verification lifecycle, last-admin protection | **Verified Live** | TESTING §7 C1–C4 (runs 2–6), §5 E9–E10 (local), §6 L12–L14 | — |
| M05 | Dynamic data processing | Full-text search, filters (cause, country, mode, date, open-only), 4 sorts, pagination; volunteer impact (verified hours by cause); org dashboard (fill rate, no-show rate, hours) | **Tested Locally** | TESTING §1 seed E5–E8, §8 volunteer/coordinator journeys | Re-check on production |
| M06 | Error & edge-case handling | WK_* error codes mapped to plain messages, retry on failed loads, loading/empty/success states, confirmation dialogs, invalid env shown as a configuration page, race conditions handled in the DB | **Tested Locally** · race edge cases **Verified Live** | TESTING §1 unit tests (24), §7 C1d/C3b, §8 capacity-0 check | — |
| M07 | Responsive UI & accessibility | Mobile-first layout, mobile menu, skip link, visible focus, labelled forms, `aria-live` notices, native `<dialog>`, per-page titles, focus moved to content on navigation | **Implemented** · 375 px check **Tested Locally** (org dashboard only) | TESTING §8 mobile row | Full pass of every page at 375 / 768 / 1280 px and a keyboard-only run |
| M08 | Deployment & documentation | Vercel project `worldkin-roster` (team Eleventh Cipher) from GitHub `main`; `vercel.json` SPA rewrite; README, blueprint, database design, testing, coverage docs | Deployment: **Implemented** (live but broken) · Docs: **Implemented** | Vercel deployments READY on 332c678 | Owner sets the real publishable key (Production + Preview); push `vercel.json` fix; set Supabase Auth Site URL; production smoke test; Documentation PDF; demo video |

## Advanced challenges

| ID | Scenario | Status | Evidence |
|---|---|---|---|
| A05 | 10 volunteers race for 1 seat → exactly 1 confirmed, 3 waitlisted (FIFO 1,2,3), 6 rejected | **Verified Live** | §7 C1 runs 1–6 |
| A05 | Same request sent 5× in parallel (idempotency key) → 1 row | **Verified Live** | §7 C2 |
| A05 | One volunteer joins two overlapping shifts at once → one succeeds, other `WK_SCHEDULE_CONFLICT` (deadlock found in run 1, fixed by wk05) | **Verified Live** | §7 C3, runs 4–6 |
| A05 | Cancel promotes waitlist head in the same transaction | **Verified Live** | §7 C4 |
| A03 | Anonymous / volunteer / coordinator / org-admin isolation, column grants, no direct writes, no forged audit, no privilege escalation | **Verified Live** | §4 L1–L10e, §6 L11–L18 |
| A03 | Past-shift guard cannot be bypassed through the API (`_is_api_request`) | **Verified Live** | §6 L12–L13 |
| A03 | No user enumeration through invites | **Verified Live** | §6 L17 |
| A03 | Platform admin recognised via API | **Not Started** (needs Founder sign-in) | §6 L19 skipped |

## Production blockers (25 Nov 2026)

1. Vercel `VITE_SUPABASE_PUBLISHABLE_KEY` holds the text "Supabase Publishable key" instead of the key → Supabase answers `401 Invalid API key`. Owner action. The app now rejects such values at startup with a clear configuration message.
2. Direct refresh of `/signup` etc. returns 404 → fixed locally by `vercel.json`; needs push + deploy approval.
