# Hackathon scorecard (self-assessment)

**Date:** 27 Nov 2026

**Rubric:** Code-ArenaX "Hack the Vibe 2026" official PDF: M01–M08 (60) plus two declared advanced challenges × 20 (40).

**Declared challenges:** A03 Advanced Security & Access Control, A05 Concurrency & Transaction Management.

> **This is an estimate, not a guaranteed score.** Judges verify live behaviour and may use hidden tests. Visual polish alone does not score.

## Evidence levels

| Code | Meaning |
|---|---|
| **Impl** | Code exists. |
| **Local** | Tested locally (unit tests, local DB suites or a local build). |
| **LiveDB** | Scripted tests against the live Supabase project. Preview and Production share this database. |
| **Preview** | Checked in a browser on the stable Preview URL with a real session. |
| **Prod** | Checked on the Production URL. |
| **—** | Not tested at that level. |

**Production is behind.** It runs `e616aad`, which lacks the recovery fix and all UI work since. Until the branch is merged, judges opening Production will not see the current app. This is the single largest score risk.

## Mandatory requirements (60)

| ID | Criterion (max) | Implementation evidence | Test evidence | Missing | Estimate | Remaining action |
|---|---|---|---|---|---|---|
| **M01** | Complete functional system (12) | Volunteer, organization and admin modules connected through applications → offers → shifts → attendance → record | **LiveDB:** apps ×3, A05 ×3; **Preview:** volunteer + admin routes PASS (read-only); **Local:** harness | **Preview:** organization pages not checked (no membership); end-to-end UI journey not recorded | 3 modules **5.5–6/6**; end-to-end **3–3.5/4**; features **2/2** → **10.5–11.5** | Record one end-to-end UI run on Preview with demo accounts; merge to Production |
| **M02** | Database & persistence (8) | 17 tables, foreign keys, partial-unique and exclusion constraints, migrations wk01–wk07 (live = repo) | **Local:** 99/99 + 96/96; **LiveDB:** runs ×3 | — | CRUD **4/4**; persistence **2/2**; relationships **2/2** → **7.5–8** | None |
| **M03** | Authentication & authorization (8) | Supabase Auth, 6-digit code, reset flow, RLS on 17/17 tables, route guards, workspace chrome rules | **LiveDB:** security L1–L18 PASS (L19 SKIP); **Local:** auth unit tests; **Preview:** sign-in and reset work | Reset fix not on Production; signup template still link-first (owner setting); non-admin denial not checked live in a browser | secure auth **2.5–3/3**; role/resource **3/3**; session **1.5–2/2** → **7–8** | Merge; owner pastes the code-only email template |
| **M04** | Complex business logic (10) | Verification state machine, selection modes, offer expiry, capacity + FIFO waitlist, attendance rules, complaint transitions | **LiveDB:** apps L2–L10, A05 C1–C4; **Local:** unit tests | — | rules **4/4**; multi-condition **3.5–4/4**; outcomes **2/2** → **9.5–10** | None |
| **M05** | Dynamic data (6) | Explore search, filters and sort; `platform_stats`; dashboards; hours totals | **Local** (real data build): Explore filters, clear, back; **Preview:** dashboards | — | search/filter/sort **3/3**; calculations **2/2**; accuracy **1/1** → **5.5–6** | None |
| **M06** | Errors & edge cases (8) | zod validation, duplicate guards (unique indexes, idempotency keys), `net.ts` timeouts, error mapping, shared states | **Local:** unit tests; **LiveDB:** 5 parallel → 1 | — | validation **3/3**; duplicates **2/2**; recovery **2.5–3/3** → **7.5–8** | None |
| **M07** | Responsive & accessibility (4) | Workspace shell, tables that collapse to cards, accessible tabs, labels, one h1, focus handling | **Local:** 4-width sweeps on every changed screen (this batch: 20 admin, 16 org, 16 public, 20 auth checks — all PASS) | Signed-in sweep on Preview not done (maximised window) | responsive **2/2**; keyboard/semantics **1/1**; feedback **1/1** → **3.5–4** | Optional phone-width pass on Preview |
| **M08** | Deployment & docs (4) | Vercel Preview READY; README, setup, env names, architecture, testing docs, evidence folder | **Preview:** reachable (Vercel login required in some browsers) | Production outdated; video and submission links not produced here | live deployment **1–2/2**; repo & docs **1.5–2/2** → **2.5–4** | Merge → Production; make the repo public; check README |
| | **Mandatory subtotal** | | | | **≈ 51.5–59.5 / 60** | |

## Advanced challenges (40)

| ID | Component (max) | Evidence | Estimate |
|---|---|---|---|
| **A03** | Implementation (8) | RLS 17/17, 28 policies, SECURITY DEFINER RPCs with a pinned `search_path`, private `org-docs` bucket, audit log, a reviewer cannot review their own organization, admins cannot suspend admins | 7.5–8 |
| | Complex scenarios (6) | **LiveDB:** L1–L18. Includes the official test "a user tries to modify another user's restricted record": direct writes denied (S1–S4), cross-organization isolation (L11, L15, L18) | 5–6 |
| | Reliability (4) | Repeatable scripted runs; advisor 0 ERROR | 3.5–4 |
| | Understanding (2) | Depends on the video and live questioning | 1–2 |
| | **A03 total** | | **17–20** |
| **A05** | Implementation (8) | `_join_shift_core` row lock and capacity check, FIFO waitlist with auto-promotion, idempotency-key unique index, `accept_offer` atomic | 8 |
| | Complex scenarios (6) | **LiveDB:** the official test "multiple users request the final available resource" (C1–C2 ×3: 1 confirmed + 1 waitlisted, no overbooking); triple accept → 1 sign-up (C3) | 5.5–6 |
| | Reliability (4) | 3 + 6 + 3 recorded runs, all PASS | 3.5–4 |
| | Understanding (2) | Depends on the video and live questioning | 1–2 |
| | **A05 total** | | **18–20** |

## Total

| Part | Estimate |
|---|---|
| Mandatory (M01–M08) | 51.5–59.5 / 60 |
| Advanced (A03 + A05) | 35–40 / 40 |
| **Grand total** | **≈ 86.5–99.5 / 100** if Production is updated and the video and links are submitted |

### What lowers the estimate

- **Production not updated:** M08 live deployment and every "judge opens the app" check suffer. A realistic floor is about −6 to −10.
- **No video, or a private repo:** the submission may not be verifiable at all.
- **Hidden tests on flows tested only through the API:** for example, organization pages in the UI.

## Submission requirements (gating, no marks)

| Item | Status |
|---|---|
| S01 YouTube video (problem, main workflow, A03 and A05 demos, one edge case) | NOT DONE — script ready in `docs/DEMO_SCRIPT.md` |
| S02 Public GitHub repository with README | Repository exists; public visibility NOT VERIFIED here |
| S03 Live URL matching the repository | FAIL until merged (Production = `e616aad`) |
| Track | World Problem Solver (README) |
