# Worldkin Roster — Requirement Coverage (47 acceptance items)

Last updated: 26 Nov 2026 · branch `feature/applications-platform`

**Statuses:** COMPLETE AND VERIFIED · IMPLEMENTED BUT NOT VERIFIED · PARTIALLY IMPLEMENTED · NOT IMPLEMENTED · BLOCKED
**Evidence levels:** *Live* = live Supabase project through its public API, or the production URL · *Local DB* = PostgreSQL 17.5 (PGlite) suites in `supabase/tests/local-pglite/` · *Unit* = vitest · *Browser* = production build in a browser.
IMPLEMENTED ≠ TESTED ≠ VERIFIED ≠ DEPLOYED.

> **Current blocker:** migrations `wk06` (applications platform) and `wk07` (storage) are prepared and tested locally but **not applied** to the live project — applying needs owner approval. Until then the new features cannot be verified live, and this branch must not be deployed (its frontend calls the new RPCs).

| # | Requirement | Implementation | Database | Evidence | Status |
|---|---|---|---|---|---|
| **M01** | | | | | |
| 1 | Authentication and role-specific functionality | `src/auth/*`, `DashboardRedirect`, role guards, three dashboards | Auth, `profiles.platform_role`, `org_members` | Live: sign-in 14 accounts, L1–L18, browser journeys (TESTING §4, §6, §8) | COMPLETE AND VERIFIED (existing roles) · new role redirect IMPLEMENTED BUT NOT VERIFIED |
| 2 | Volunteer and Organization registration | `/join`, `/signup?as=…`, `OrgCreatePage` (2-step) | `create_organization` (extended), `organization_private` | Live: sign-up + email confirmation (§11); Local DB ORG1–ORG4 | PARTIALLY IMPLEMENTED → org extended fields IMPLEMENTED BUT NOT VERIFIED live |
| 3 | Volunteer profile management | `ProfilePage` (education, skills, interests, languages, availability, experience, about, photo, private phone) | `profiles` (+6 columns), `profile_private`, `avatars` bucket | Local DB P5–P6; Unit (validation) | IMPLEMENTED BUT NOT VERIFIED |
| 4 | Organization profile management | `OrgSettingsPage` (public details, logo, private verification data, documents) | `organizations` (+5 columns), `organization_private`, `org-docs` bucket | Local DB PRIV1–PRIV3 | IMPLEMENTED BUT NOT VERIFIED (storage untestable locally) |
| 5 | Opportunity CRUD | `OpportunityEditorPage` (+ type, compensation, selection mode, deadline), close/publish | `opportunities`, guard triggers, CHECKs | Live: create/publish/close via API (A05 fixtures); Local DB OPP1–OPP4, AP9, M3 | COMPLETE AND VERIFIED (base) · new fields IMPLEMENTED BUT NOT VERIFIED live |
| 6 | Application submission and hiring decisions | `ApplyPanel`, `MyApplicationsPage`, `OrgApplicationsPage` | `applications`, `application_notes`, `offers`; RPCs apply/withdraw/review/send/revoke/accept/decline | Local DB AP1–AP9, R1–R2, O1–O10, E1–E3, X1–X7 | IMPLEMENTED BUT NOT VERIFIED (live script ready) |
| 7 | Shift and Signup management | `ShiftManagePage`, `OpportunityPage`, `MyShiftsPage` | `shifts`, `signups`, `join_shift`/`_join_shift_core`, `cancel_signup`, capacity RPCs | Live: A05 C1–C4 ×6 runs, browser journeys | COMPLETE AND VERIFIED |
| 8 | Complete user-facing workflows | Volunteer, organization, admin dashboards with section navigation | all of the above | Browser journeys (pre-wk06, §8); new flows not yet live | PARTIALLY IMPLEMENTED (admin journey + new flows not verified live) |
| **M02** | | | | | |
| 9 | Correct tables and relationships | 17 tables | wk01–wk06 | Local DB: all migrations apply; Live: 9 tables (pre-wk06) | COMPLETE AND VERIFIED (9 live) · 8 new tables IMPLEMENTED BUT NOT VERIFIED live |
| 10 | Primary and foreign keys | composite FKs keep org isolation (`applications`→`opportunities(id, org_id)`, `offers`→`shifts(id, org_id)`) | | Local DB D1–D4, O1 (shift mismatch) | IMPLEMENTED BUT NOT VERIFIED live |
| 11 | Constraints and indexes | CHECKs (compensation, deadline, rating, lengths), partial unique (one active application, one pending offer), exclusion constraint, query indexes | | Local DB OPP1–OPP2, AP3–AP4, O4, F4; Live: A05 | COMPLETE AND VERIFIED (existing) · new IMPLEMENTED BUT NOT VERIFIED live |
| 12 | Persistence and integrity | append-only audit/participation, transactions, idempotency | | Live: §6–§7; Local DB 99 + 96 | COMPLETE AND VERIFIED |
| **M03** | | | | | |
| 13 | Secure signup and login | email confirmation ON, `/auth/confirmed`, password reset `/forgot-password` → `/auth/reset` | Supabase Auth | Live: production sign-up + confirmation (§11); reset IMPLEMENTED | COMPLETE AND VERIFIED (sign-up/in) · reset IMPLEMENTED BUT NOT VERIFIED |
| 14 | Role-based authorization | RLS + RPC checks (`is_org_member`, `is_org_admin`, `is_platform_admin`) | wk03, wk06 policies | Live L1–L18; Local DB P1–P8, S1–S9, F6, C4 | COMPLETE AND VERIFIED (existing) · new IMPLEMENTED BUT NOT VERIFIED live |
| 15 | Protected routes | `RequireAuth`, `RequireOrgRole`, `RequirePlatformAdmin` (UX only; DB is the gate) | — | Browser: coordinator blocked from admin-only pages (§8) | COMPLETE AND VERIFIED |
| 16 | Secure session and password handling | supabase-js session, tokens stripped from URL, no secrets in browser, env guard | — | Browser §11; Unit (env guard, redirect safety) | COMPLETE AND VERIFIED |
| **M04** | | | | | |
| 17 | Organization verification | pending → verified/rejected/suspended; docs + private details for review; unverified cannot publish | `review_organization`, guard trigger, `organization_private` | Live: L15, seed states; Local DB ORG4 | COMPLETE AND VERIFIED (workflow) · document review IMPLEMENTED BUT NOT VERIFIED |
| 18 | Paid, Stipend-based and Voluntary opportunities | type + mandatory compensation details shown before applying; filter | `compensation_type`, CHECK | Local DB OPP1, OPP3, ST3; Unit | IMPLEMENTED BUT NOT VERIFIED |
| 19 | Application lifecycle and hiring workflow | submitted → under_review → selected (72 h offer) → accepted/declined/expired; rejected; withdrawn; revoked | applications/offers RPCs, server-side expiry | Local DB AP*, O*, E*, X* (all pass) | IMPLEMENTED BUT NOT VERIFIED |
| 20 | Shift capacity and waitlist logic | row locks, FIFO, promotion; offer acceptance uses the same core | `_join_shift_core` | Live A05 ×6; Local DB W1–W2 | COMPLETE AND VERIFIED (join path) · offer path IMPLEMENTED BUT NOT VERIFIED live |
| **M05** | | | | | |
| 21 | Database-driven homepage statistics | Home stats row | `platform_stats()` | Local DB ST1 | IMPLEMENTED BUT NOT VERIFIED |
| 22 | Dynamic opportunity listings | Home (recent, closing soon), Explore, org profile | `search_opportunities` | Live (pre-wk06 version); Local DB ST3–ST4 | IMPLEMENTED BUT NOT VERIFIED (new version) |
| 23 | Search, filtering and sorting | keyword, cause, type, mode, country, city, skill, date, open spots; 5 sorts; pagination; org directory search | | Local DB ST2–ST4 | IMPLEMENTED BUT NOT VERIFIED |
| 24 | Dynamic dashboards | volunteer impact, org dashboard, admin overview | `my_impact`, `org_dashboard`, `admin_overview` | Live: browser journeys (impact/org); Local DB ST6 | COMPLETE AND VERIFIED (volunteer/org) · admin IMPLEMENTED BUT NOT VERIFIED |
| **M06** | | | | | |
| 25 | Form validation | zod schemas mirror DB CHECKs; field-level messages | CHECKs | Unit 33/33 | COMPLETE AND VERIFIED (unit) |
| 26 | Duplicate prevention | idempotent joins/applications/acceptance, one active application, one pending offer, one feedback | unique indexes | Live C2; Local DB AP3–AP4, O8, F4 | COMPLETE AND VERIFIED (joins) · new IMPLEMENTED BUT NOT VERIFIED live |
| 27 | Authorization error handling | WK_* codes → plain messages; "No access" screens | | Unit; Browser §8 | COMPLETE AND VERIFIED |
| 28 | Database and network error handling | `toAppError`, retry buttons, network/rate-limit messages | | Unit; Browser (graceful "—" when RPC missing) | COMPLETE AND VERIFIED |
| 29 | Loading, empty, success, failure states | skeletons, EmptyState, aria-live notices, dialogs | | Browser §8, §10, this branch at 375 px | COMPLETE AND VERIFIED |
| **M07** | | | | | |
| 30 | Mobile responsiveness | | | Browser 375 px: home, join, sign-up, explore, organizations (no overflow) | COMPLETE AND VERIFIED (public pages) · dashboards after wk06 NOT VERIFIED |
| 31 | Tablet and desktop | responsive grids, scrollable dashboard nav | | Browser desktop | PARTIALLY IMPLEMENTED (tablet not measured) |
| 32 | Accessible forms, navigation, status | labels, skip link, focus on navigation, per-page titles, text+colour badges, aria-live | | Browser §10 | COMPLETE AND VERIFIED (checked pages) |
| **M08** | | | | | |
| 33 | Production-build readiness | `npm run build` | | build OK (this branch) | COMPLETE AND VERIFIED |
| 34 | Environment configuration | `.env.example`, env guard, Vercel vars | | Live production (§11) | COMPLETE AND VERIFIED |
| 35 | Setup and architecture documentation | README, BLUEPRINT, DATABASE_DESIGN, DESIGN_DECISIONS | | docs | IMPLEMENTED BUT NOT VERIFIED (final review pending) |
| 36 | Testing documentation | `docs/TESTING.md`, `docs/evidence/` | | docs | COMPLETE AND VERIFIED (for executed tests) |
| **A03** | | | | | |
| 37 | Correct RLS policies | RLS on all 17 tables; deny-by-default grants | wk03, wk06 | Live L1–L18; Local DB P*, D*, N*, C* | COMPLETE AND VERIFIED (9 tables) · 8 new IMPLEMENTED BUT NOT VERIFIED live |
| 38 | Organization-level data isolation | `is_org_member` on applications/offers/notes/private | | Live L11, L18; Local DB P1–P2, PRIV1 | COMPLETE AND VERIFIED (existing) · new IMPLEMENTED BUT NOT VERIFIED live |
| 39 | Volunteer privacy | phone in owner-only table; applicant RPC without contact data; public feedback first name only | `profile_private`, `org_applications`, `org_feedback` | Local DB P5–P7, F5 | IMPLEMENTED BUT NOT VERIFIED live |
| 40 | Secure RPC authorization | SECURITY DEFINER, `search_path=''`, explicit EXECUTE grants, internal functions not callable | | Live L7, L10c; Local DB D5–D6 | COMPLETE AND VERIFIED (existing) · new IMPLEMENTED BUT NOT VERIFIED live |
| 41 | Platform Admin privilege protection | no public admin sign-up; role not writable; admins cannot suspend admins/self | | Live L4, L10; Local DB S1–S2, S6, S9 | COMPLETE AND VERIFIED (existing) · L19 BLOCKED (Founder sign-in) |
| **A05** | | | | | |
| 42 | Atomic shift booking | single transaction per booking | | Live C1–C4 ×6 | COMPLETE AND VERIFIED |
| 43 | Capacity locking and FIFO waitlist | shift `FOR UPDATE`, `queue_seq` | | Live C1, C4 | COMPLETE AND VERIFIED |
| 44 | Idempotent operations | idempotency keys (join, accept), replayed responses | | Live C2; Local DB O8 | COMPLETE AND VERIFIED (join) · accept IMPLEMENTED BUT NOT VERIFIED live |
| 45 | Concurrent booking safety | volunteer lock (wk05), exclusion constraint, lock order volunteer → application → offer → shift → signup, SKIP LOCKED expiry | | Live C3 (deadlock fixed, runs 4–6) | COMPLETE AND VERIFIED (join) · concurrent offer acceptance: live script `live_applications_check.mjs` C1–C3 ready, BLOCKED until wk06 applied |
| 46 | Comprehensive concurrency testing | `concurrency_check.mjs`, `live_applications_check.mjs` | | 6 live runs | PARTIALLY IMPLEMENTED (offer concurrency pending live run) |
| **Product** | | | | | |
| 47 | End-to-end integration (public pages, auth, registration, dashboards, opportunities, applications, offers, signups, attendance, complaints, feedback, database, notifications) | all modules wired in router and navigation | wk01–wk07 | Local DB + Unit + Browser (pre-wk06) | IMPLEMENTED BUT NOT VERIFIED — BLOCKED on applying wk06/wk07 |

## What would make every item COMPLETE AND VERIFIED

1. Owner approval to apply `wk06` and `wk07` to `ekkvwgohpzliwbmjnrth`; regenerate `database.types.ts`.
2. Run `live_applications_check.mjs` (×3), `concurrency_check.mjs` and `live_security_check.mjs` again.
3. Browser journeys on a preview deployment: volunteer (profile → apply → offer → accept), organization (register → upload documents → verify → publish → review → offer → attendance), admin (verify, moderate, complaints, feedback, suspension) — the admin journey needs the Founder's sign-in.
4. Tablet (768 px) pass.
