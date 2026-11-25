# Worldkin Roster — Test Results

Only results from real runs are recorded here, with their date and environment.
**Local** = throwaway PostgreSQL 17.5 (PGlite) or the frontend toolchain.
**Live** = the real Supabase project `worldkin-roster` (`ekkvwgohpzliwbmjnrth`) through its public Data API.

## 1. Local verification (25 Nov 2026)

| Suite | Command / harness | Result |
|---|---|---|
| TypeScript strict | `npx tsc -b` | 0 errors |
| Lint | `npm run lint` (oxlint) | 0 warnings |
| Unit tests | `npm test` (vitest) | 23/23 |
| Production build | `npm run build` | success, largest chunk 353 kB |
| Database behaviour | `supabase/tests/local-pglite/tests.mjs` on PG 17.5 | 99/99 |
| Security focus (enumeration, operator path) | `supabase/tests/local-pglite/security_focus.mjs` | all expected outcomes (incl. T1–T4 blocked) |
| Demo seed (incl. Demo labels, Founder untouched) | `supabase/tests/local-pglite/seed_check.mjs` | 14/14 (E0–E13) |
| `join_shift` deadlock fix (wk05) | `tests.mjs` + `seed_check.mjs` with wk05 applied | 99/99 · 14/14 |

## 2. Live — structural (25 Nov 2026, after migrations)

`supabase/tests/post_migration_checks.sql`: 9 tables with RLS, 15 policies, 32 functions all with pinned `search_path`, 22 API-executable functions (no internal/trigger functions), 19 + 2 triggers, 5 key constraints, `btree_gist` 1.7. Security advisor: no ERROR (expected WARN 0028/0029 for the SECURITY DEFINER RPC design).

## 3. Live — test accounts (25 Nov 2026)

`supabase/tests/create_test_users.mjs` (owner's terminal): created=14 existed=0 failed=0.
Read-only check: 14 `@worldkin.test` accounts, 14 confirmed, 14 profiles auto-created by trigger, all `volunteer`, 0 org memberships.

## 4. Live — A03 pre-seed checks (25 Nov 2026 13:15 UTC, no writes)

`node supabase/tests/live_preseed_check.mjs` → **16/16 PASS**

| ID | Check | Result |
|---|---|---|
| P0 | all 14 test accounts sign in | PASS |
| L1 | anon cannot read signups | PASS |
| L2 | anon cannot read profiles | PASS |
| L3 | anon sees only published, non-sensitive opportunities | PASS |
| L3b | anon cannot read audit logs | PASS |
| L4 | volunteer cannot set own `platform_role` (42501) | PASS |
| L5 | volunteer cannot insert signups directly (42501) | PASS |
| L6 | volunteer cannot review organizations (`WK_FORBIDDEN`) | PASS |
| L7 | `_promote_waitlist` not callable | PASS |
| L8 | volunteer sees only own signups | PASS |
| L9 | volunteer reads no audit rows | PASS |
| L10 | volunteer `is_platform_admin()` = false | PASS |
| L10b | volunteer sees only own profile | PASS |
| L10c | `_is_api_request` not callable | PASS |
| L10d | volunteer cannot edit other profiles (0 rows) | PASS |
| L10e | volunteer cannot forge audit entries (42501) | PASS |

Post-run read-only check confirmed nothing was written (audit_logs unchanged, 0 signups, 0 organizations, no role changes, no altered names).

## 5. Live — demo seed (25 Nov 2026, owner-approved)

`supabase/seed/demo_seed.sql` executed once as a single transaction (operator session). Read-only verification:

| Check | Result |
|---|---|
| Organizations | 3, all labelled "(Demo)": 2 verified, 1 pending |
| Memberships | demo.orgadmin → 2 orgs (org_admin), demo.coordinator → 1 (coordinator), demo.volunteer2 → pending org (org_admin) |
| Opportunities / shifts / past shifts | 7 / 9 / 2 — all labelled Demo |
| Signups / verified participation records | 3 / 2 |
| Founder and other real profiles | byte-identical before vs after (md5 `fc9d6f1f…` unchanged); Founder in 0 organizations |
| Platform roles | 1 platform_admin (Founder), 16 volunteers — unchanged |
| Audit | 28 new rows, all `actor_id = null` (operator action, as designed) |

## 6. Live — A03 full security check (25 Nov 2026 13:35 UTC)

`node supabase/tests/live_security_check.mjs` → **20/20 PASS, 1 SKIP**

Beyond the pre-seed checks (L1–L10): L11 coordinator of org A cannot read org B roster · **L12 API cannot create a past shift and L13 cannot move a shift into the past — the hardened `_is_api_request()` guard works through real PostgREST** · L14 `capacity` not directly writable (42501) · L15 no shift creation for another org · L16 coordinator reads no audit rows · **L17 invite response identical for registered and unregistered emails (no enumeration)** · L18 org admin sees only own-org audit rows · CLEAN fixtures cancelled/revoked.
SKIP L19 (Founder `is_platform_admin` via API) — needs the Founder's own password; not provided.

## 7. Live — A05 concurrency (25 Nov 2026, 3 runs, 10 parallel volunteers)

`node supabase/tests/concurrency_check.mjs`

| Check | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| C1a exactly 1 of 10 parallel joins confirmed (capacity 1) | PASS | PASS | PASS |
| C1b exactly 3 waitlisted (limit 3) · C1c positions 1,2,3 · C1d 6 × `WK_SHIFT_FULL` · C1e DB state | PASS | PASS | PASS |
| C2 5 parallel identical requests (same idempotency key) → 1 row, 1 non-replayed | PASS | PASS | PASS |
| C3a exactly one of two overlapping joins (same volunteer) succeeds | PASS | PASS | PASS |
| C3b the other gets `WK_SCHEDULE_CONFLICT` | **FAIL** | PASS | PASS |
| C4 cancel promotes waitlist head (FIFO) | PASS | PASS | PASS |
| CLEAN fixtures cancelled, test opportunity closed | PASS | PASS | PASS |

**Finding (run 1, C3b):** the losing request received `40P01 deadlock detected` (HTTP 500) instead of `WK_SCHEDULE_CONFLICT`. Integrity held — exactly one place was created, no double booking — but the error was not user-friendly, and the earlier design claim "no deadlock cycle" was wrong. Cause: two joins by the same volunteer lock *different* shift rows, both insert, then wait on each other inside the exclusion constraint. **Fix:** migration `wk05` (`20261125135004`) makes `join_shift` take a per-volunteer row lock (`profiles … FOR NO KEY UPDATE`) before the shift lock; locally 99/99 + 14/14 still pass. Applied live on 25 Nov 2026 with owner approval; verified read-only: still SECURITY DEFINER, `search_path=''`, executable by `authenticated` only, lock present.

**After the fix — 3 more runs (runs 4–6): 13/13 PASS each, including C3b `WK_SCHEDULE_CONFLICT` every time.**

## 8. Live — browser journeys (localhost against the live project, 25 Nov 2026)

| Role | Journey | Result |
|---|---|---|
| Volunteer (demo.volunteer1) | sign in → redirected to `next` → Explore (6 results incl. sensitive, badges) → opportunity (skill-match hint, verified org, hours per shift) → join → "confirmed" (aria-live) → add-to-calendar shown → cancel via dialog → "cancelled" → My shifts (7 h, by cause, history) → Verified record (7 h, 2 shifts, 2 orgs) | PASS, no console errors |
| Coordinator (demo.coordinator) | Organizations → org dashboard (4 upcoming shifts, 4 h, 50% no-show, 3 live/1 draft; no Team/Audit links) → shift page → capacity 0 blocked by browser validation → capacity 2 ✓ → back to 1 ✓ → direct URL to Team page → "No access" | PASS |
| Org admin (demo.orgadmin) | Team page (2 members, revoked test invites) → audit log (capacity changes with actor, join/cancel diffs) | PASS, no console errors |
| Platform admin | review queue / suspend | **Not run** — needs the Founder's own sign-in |
| Mobile 375 px (signed in) | org dashboard: no horizontal overflow | PASS |

Issues found and fixed during the journeys: dialog was not centred (Tailwind reset removed native `<dialog>` margin → `m-auto`); cancelled `[TEST]` shifts appeared in public shift lists (now hidden unless the viewer had a place); coordinator saw "not a member" on admin-only pages (now "Only organization admins…"); closed `[TEST]` opportunities sorted first on the org page (now last); stat tiles use 2 columns on mobile.

## 9. Pending

| Item | Needs |
|---|---|
| L19 + platform-admin review journey | Founder sign-in (owner) |
| Production smoke test | deployment approval |

## 10. Production readiness fixes (25 Nov 2026, local)

| Check | Result |
|---|---|
| Root cause "Invalid API key" | Vercel production bundle contains the 24-character text "Supabase Publishable key" instead of the key; Supabase returns `401 Invalid API key` for that value and `200` for the real publishable key. Env variable **names** on Vercel match the code. |
| Env guard | now rejects placeholder text, quotes and whitespace → "Configuration required" page (unit test + production build with the placeholder) |
| Direct URL refresh | `vercel.json` rewrites every non-`/assets/` path to `index.html` (rule checked for /signup, /login, /explore, /me/record, /org/…); `/login?next=/me` → `/signin?next=%2Fme` |
| Production-like build (real public config, `vite preview`, 375 px) | /, /explore, /signin, /signup, opportunity detail, 404: no horizontal overflow, all inputs labelled, per-page tab title, focus moves to main content after navigation, no console errors |
| Toolchain | tsc 0 · lint 0 · tests 24/24 · build OK |

## 11. Email confirmation flow (25 Nov 2026)

Root cause of `http://localhost:3000/#access_token=…`: the app already asked for the production origin (`emailRedirectTo`), but Supabase only honours it when it is on the project's Redirect URL allow-list; otherwise it uses the Site URL, whose default is `http://localhost:3000`. Fix = Supabase Auth URL Configuration (owner) + a dedicated `/auth/confirmed` page.

| Scenario (production build, `vite preview`) | Result |
|---|---|
| Successful confirmation (real test-account session delivered exactly like Supabase's implicit-flow redirect, `?next=/explore`) | "Email confirmed" → signed in → forwarded to /explore; tokens removed from the address bar; no console errors |
| Expired / already-used link on `/auth/confirmed` | "This confirmation link has expired or was already used" + sign-in link + resend form; error removed from URL |
| Same error landing on `/` (Site URL fallback) | redirected to `/auth/confirmed` with the same message |
| `/auth/confirmed` opened directly, signed out | "Confirm your email" + resend form |
| Unit tests (`authRedirect.test.ts`) | redirect URL, open-redirect protection, error parsing, token-fragment detection — 29/29 total |
| Live `worldkin-roster.vercel.app` (commit 332c678, before this fix) | key now correct (matches publishable key); `/signup`, `/signin`, `/explore`, `/login`, `/me` → **404** (vercel.json not deployed yet) |

## 12. Applications platform — migration wk06 (26 Nov 2026, local only)

Branch `feature/applications-platform`. **Not applied live** (awaiting approval); all results below are local.

| Suite | Result | Evidence |
|---|---|---|
| wk06 suite (`supabase/tests/local-pglite/wk06_tests.mjs`) — organizations, privacy, opportunities, applications, offers, expiry, revoke/decline/reject/withdraw, direct-write denial, notifications, feedback, complaints, suspension, moderation, statistics, directory, search | **96/96** | `docs/evidence/local_wk06_tests.txt` |
| Regression: original DB suite with wk01–wk06 | **99/99** | `docs/evidence/local_regression_99.txt` |
| Demo seed with wk06 | 14/14 | local run |
| Operator-path tamper tests T1–T4 | all blocked | local run |
| Unit tests (incl. new validation tests) | 33/33 | `npm test` |
| TypeScript / lint / build | 0 / 0 / OK | local |
| Browser (production build vs live project without wk06) | new public pages render; missing RPCs degrade to "—"/error states; 375 px no overflow on home, join, sign-up, explore, organizations | manual run |

Not testable locally: storage buckets/policies (`wk07`), real parallel transactions (PGlite is single-connection) — covered by `supabase/tests/live_applications_check.mjs` (C1 simultaneous last-seat acceptance, C2 no overbooking, C3 triple parallel acceptance of one offer) once wk06 is applied.
