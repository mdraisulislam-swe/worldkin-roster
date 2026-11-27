# Worldkin Roster — final project audit

**Date:** 27 Nov 2026

**Supabase project:** `ekkvwgohpzliwbmjnrth` (verified; no other project touched)

**Scope of this round:** R1–R5 prototype replication, R6 content requirements, consolidated verification and final docs.

**No changes to:** data, migrations, Auth settings, SMTP or templates. Nothing was pushed, merged or deployed.

**Companion documents:**
- [`PROTOTYPE_COMPLETION_REPORT.md`](PROTOTYPE_COMPLETION_REPORT.md): all 45 screens;
- [`design/PROTOTYPE_VERIFIED.md`](design/PROTOTYPE_VERIFIED.md): per-screen notes;
- [`HACKATHON_SCORECARD.md`](HACKATHON_SCORECARD.md): rubric;
- [`REMAINING_TASKS.md`](REMAINING_TASKS.md): action plan;
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md): video;
- [`FINAL_AUDIT.md`](FINAL_AUDIT.md): earlier audit, 27 Nov morning; its bug list and evidence table are still valid.

## A. Prototype completion (45 screens)

| Status | Count | Screens |
|---|---|---|
| VERIFIED | 31 | A01–A04, A06, B01, B02, B04–B06, B07 ×2, C01–C08, D01, D03, D04, D06, D07, D08, E01–E06, states, 404 |
| PARTIAL | 4 | A05, A07, D02 (section of the overview), D05 (inline detail) |
| NOT CONNECTED | 6 | A08, A09, A10, A11, B03, E07 — each needs an unapproved migration (wk08/wk12/wk13) |
| BLOCKED | 1 | A12 About/Contact/Privacy/Terms — content list in the completion report §R6 |
| NOT IMPLEMENTED | 1 | D09 Reports |
| REFERENCE | 2 | prototype index, design-system page |

**This round:**

| Batch | Commit | Screens |
|---|---|---|
| R1 | 8e30139 | C06 certificates, C07 notifications, C08 profile |
| R2 | ecdaa09 | D03 editor with live preview, D06–D07 roster and attendance, D08 tabbed organization profile |
| R3 | a93105e | E02 verification, E03 users, E04 moderation tabs, E05 complaints, admin sidebar labels |
| R4/R5 | 0d976e7 | A04 directory, B01/B02 sign-in roles, auth photos (prototype's own) |

**Defects found and fixed during comparison:**
- organization settings tab strip and file inputs overflowed at 375 px and 1024 px (fixed in R2);
- the moderation tab active colour did not match the shared tabs (fixed in R3).

## B. Technical completion

### Files changed since the pushed branch head (`a1419e1`)

22 files, +771 / −260:
- **pages:** Volunteer, Profile, OpportunityEditor, ShiftManage, OrgPlatform, Org, Admin, AdminPlatform, Auth, Organizations;
- **components:** WorkspaceLayout, AuthFrame;
- **lib:** nav, workspace, format, authRedirect, notificationKinds;
- **tests:** resetFlow, notificationKinds, workspace, WorkspaceLayout;
- **docs:** PROTOTYPE_VERIFIED.

**No server logic changed.** No API, query, mutation, RPC, RLS or validation logic changed in R1–R5. Edits are layout, wording and presentation only, and each batch's field census confirmed every form field is still submitted once.

### Consolidated verification (27 Nov, local, after the last commit)

| Check | Result | Count / detail |
|---|---|---|
| TypeScript `tsc -b` | PASS | 0 errors |
| Lint `oxlint` | PASS | 0 warnings, 0 errors |
| Unit tests `vitest` | PASS | 16 files, 127/127 tests |
| Production build `vite build` | PASS | — |
| Secret scan (tracked files) | PASS | Only placeholders (`sb_publishable_replace_me`), test fixtures and the guard rejecting `sb_secret_`. Real publishable key: 0 hits. Only `.env.example` is tracked |
| Secret scan (build output) | PASS | Only the guard strings |
| Visual comparison at 1440 (side by side) | PASS | D03, D06/D07, D08, E02–E05, A01, A03, A04, B01/B02, B04–B06 |
| 4-width sweep (375/820/1024/1440) | PASS | **R2:** 16/16 after the fix (first run 14/16 FAIL → fixed). **R3:** 20/20. **Public:** 20/20 (5 pages). **Auth:** 20/20 (5 pages) |
| Route checks | PASS | All changed routes render one `h1` and one `main`; unchanged route contracts (unit tests cover guard and chrome rules) |
| Regressions | PASS | Full unit suite; no failing test changed |
| Preview browser smoke (real session) | PASS / BLOCKED | Volunteer + admin routes PASS (earlier today, before R2–R5). Organization pages BLOCKED (no membership). R1–R5 not on Preview (not pushed) |
| Production | NOT RUN | Production is `e616aad`; nothing deployed this round |
| Live DB suites | NOT RUN (reused) | No schema change; reusing apps ×3, A05 ×3, C1–C4 ×6, security L1–L18 |
| PDF export | see below | — |

### Security and concurrency evidence (unchanged, reused)

- **A03:**
  - RLS on 17/17 tables, 28 policies, no always-true write policies, no anon write grants;
  - SECURITY DEFINER functions pin `search_path`;
  - private `org-docs` bucket;
  - live L1–L18 PASS, L19 SKIP (needs the Founder's sign-in);
  - direct-write denial S1–S4 PASS.
- **A05:**
  - `_join_shift_core` row lock + capacity check;
  - FIFO waitlist;
  - idempotency unique index;
  - last-seat race C1–C2 ×3 → 1 confirmed + 1 waitlisted;
  - triple accept → 1 sign-up.

### Known bugs (open)

| ID | Severity | Bug |
|---|---|---|
| B1 | High (owner setting) | Sign-up email is link-first. The code-only template has not been pasted in the Dashboard |
| B2 | High (release) | Production is behind (`e616aad`) |
| B4 | Low | Footer "Report a concern" needs sign-in |
| B5 | Cosmetic | Bottom tab label truncation at 375 px |

## C. Scorecard

See [`HACKATHON_SCORECARD.md`](HACKATHON_SCORECARD.md):

| Part | Estimate |
|---|---|
| Mandatory | ≈ 51.5–59.5 / 60 |
| Advanced | ≈ 35–40 / 40 |
| Total | ≈ 86.5–99.5 |

The total assumes Production is updated and the video and public repository are submitted. **Not guaranteed.**

## D. Action plan

See [`REMAINING_TASKS.md`](REMAINING_TASKS.md).

- **P0:** push (approval); organization smoke test on Preview; PR → main → Production (approval); Redirect URL; video; public repository.
- **P1:** email template; browser denial check; phone-width real-session pass; testing docs; A05/A07 re-compare; L19.
- **P2:** legal pages (content), Reports, migration-gated features, cosmetics.
