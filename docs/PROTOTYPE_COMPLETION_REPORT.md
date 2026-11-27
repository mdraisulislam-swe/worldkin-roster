# Prototype completion report

**Date:** 27 Nov 2026

**Branch:** `feature/applications-platform`, local HEAD `0d976e7` (not pushed)

**Reference:** `Worldkin-Roster-Original-Prototype.zip`, 45 screens. It is byte-identical to the prototype served on port 4300.

**Per-screen detail:** [`docs/design/PROTOTYPE_VERIFIED.md`](design/PROTOTYPE_VERIFIED.md)

## Method

- **What counts as VERIFIED:** the prototype and the React screen were captured at 1440 px and compared side by side, and a layout sweep passed at 375 / 820 / 1024 / 1440 px (no horizontal overflow, exactly one `h1`, one `main`).
- **Where the React renders come from:**
  - **Public and auth pages:** a local production build reading real public data. Read-only, with the publishable key passed through the environment only.
  - **Workspace pages:** a throwaway harness with labelled sample data. It is never committed.
- **Not counted as evidence:** screenshots alone. Every changed screen also passed type-check, lint, 127 unit tests and the build.

## Status legend

| Status | Meaning |
|---|---|
| VERIFIED | Compared side by side and swept at 4 widths. Remaining differences are listed and intentional. |
| PARTIAL | Built and swept at 4 widths, but not fully re-compared, or the layout deliberately differs. |
| NOT CONNECTED | The prototype shows a feature with no backend (needs an unapproved migration). It is not faked in the app. |
| BLOCKED | Needs content or a decision from the owner. |
| NOT IMPLEMENTED | No screen yet. |
| REFERENCE | Prototype-only index or design-system page; not a product screen. |

## A. 45 screens

| # | Code | Screen | React route | Status | Batch |
|---|---|---|---|---|---|
| 1 | A01 | Homepage | `/` | VERIFIED | R4 (no change needed) |
| 2 | A02 | Discover | `/explore` | VERIFIED | step 4 |
| 3 | A03 | Opportunity details | `/opportunities/:id` | VERIFIED (deviation: one Join per shift) | R4 |
| 4 | A04 | Organizations directory | `/organizations` | VERIFIED | R4 |
| 5 | A05 | Organization trust profile | `/organizations/:slug` | PARTIAL | R4 |
| 6 | A06 | Events | `/events` | VERIFIED | step 4 |
| 7 | A07 | Event details | `/events/:id` | PARTIAL | R4 |
| 8 | A08 | Stories & media | — | NOT CONNECTED (wk08) | — |
| 9 | A09 | Video experience | — | NOT CONNECTED (wk08) | — |
| 10 | A10 | Map discovery | — | NOT CONNECTED (wk12) | — |
| 11 | A11 | Emergency network | — | NOT CONNECTED (wk12; must be labelled "not an emergency service") | — |
| 12 | A12 | About, contact & legal | — | BLOCKED (content) | R6 |
| 13 | B01 | Volunteer sign in | `/signin?as=volunteer` | VERIFIED | R5 |
| 14 | B02 | Organization sign in | `/signin?as=org` | VERIFIED | R5 |
| 15 | B03 | Admin sign in + MFA | — | NOT CONNECTED (wk13) | — |
| 16 | B04–B06 | Registration | `/join`, `/signup?as=…` | VERIFIED (deviation: role choice on `/join`) | R5 |
| 17 | B07 | Email code (OTP) | `/verify-email` | VERIFIED | earlier |
| 18 | B07 | Password recovery | `/forgot-password`, `/auth/reset` | VERIFIED | earlier |
| 19 | C01 | Volunteer overview | `/me` | VERIFIED | step 2 |
| 20 | C02–C03 | Applications & offers | `/me/applications` | VERIFIED | step 3 |
| 21 | C04 | Calendar | `/me/calendar` | VERIFIED | earlier |
| 22 | C05 | Experience passport | `/me/record` | VERIFIED | earlier |
| 23 | C06 | Certificates | `/me/record`, `/me/certificate/:id` | VERIFIED | R1 |
| 24 | C07 | Notifications | `/me/notifications` | VERIFIED | R1 |
| 25 | C08 | Profile & settings | `/me/profile` | VERIFIED | R1 |
| 26 | D01 | Organization overview | `/org/:id` | VERIFIED | step 2 |
| 27 | D02 | Opportunity management | `/org/:id` (list on the overview) | PARTIAL | R2 |
| 28 | D03 | Create opportunity | `/org/:id/opportunities/new`, `/:oppId` | VERIFIED | R2 |
| 29 | D04 | Applicants | `/org/:id/applications` | VERIFIED | step 3 |
| 30 | D05 | Applicant detail | inline in D04 | PARTIAL | R2 |
| 31 | D06 | Offers & shifts | `/org/:id/shifts/:shiftId` | VERIFIED | R2 |
| 32 | D07 | Attendance | `/org/:id/shifts/:shiftId` | VERIFIED | R2 |
| 33 | D08 | Organization profile | `/org/:id/settings` | VERIFIED | R2 |
| 34 | D09 | Reports & analytics | — | NOT IMPLEMENTED | R6 |
| 35 | E01 | Admin overview | `/admin` | VERIFIED | step 2 |
| 36 | E02 | Organization verification | `/admin/organizations` | VERIFIED | R3 |
| 37 | E03 | Users | `/admin/users` | VERIFIED | R3 |
| 38 | E04 | Content moderation | `/admin/opportunities`, `/admin/feedback` | VERIFIED | R3 |
| 39 | E05 | Disputes & reviews | `/admin/complaints` (styling) | VERIFIED (styling) | R3 |
| 40 | E06 | Audit log | `/admin/audit` | VERIFIED | earlier |
| 41 | E07 | Admin access management | — | NOT CONNECTED (wk13) | — |
| 42 | 09 | States (loading/empty/error/denied/offline) | shared components | VERIFIED | earlier |
| 43 | — | 404 | `NotFoundPage` | VERIFIED | earlier |
| 44 | 00 | All screens index | — | REFERENCE | — |
| 45 | 01·09 | Design system page | tokens and components | REFERENCE | — |

### Totals (45)

| Status | Count |
|---|---|
| VERIFIED | 31 |
| PARTIAL | 4 (A05, A07, D02, D05) |
| NOT CONNECTED | 6 (A08, A09, A10, A11, B03, E07) |
| BLOCKED | 1 (A12) |
| NOT IMPLEMENTED | 1 (D09) |
| REFERENCE | 2 |

Of the 37 product screens the app can show without new migrations or content, 31 are VERIFIED and 4 are PARTIAL.

## Intentional deviations (kept on purpose)

- **Routes:** no route contract was changed. Prototype screens that are separate pages but are sections in the app (D02, D05) stay as sections.
- **Fake controls:** prototype controls with no backend are left out, not faked. Examples: the reviewer checklist, role/status filter selects on Users, "Keep me signed in", demo-role chips, ratings on organization cards.
- **Photos:** only the prototype's own Unsplash photos (`hero`, `team`) are used, on the home hero and auth panels. They are decorative and hide if they fail to load. No new images were invented.

## R6 — content requirements (BLOCKED)

These pages need text the owner must supply or approve. Nothing was written for them.

| Page | Needed from the owner |
|---|---|
| About | Mission statement (2–3 sentences); who runs Worldkin; the problem and intended users (can reuse the README problem statement if approved); founding year/location only if true |
| Contact | A public contact email or form destination; response-time promise (if any); postal address only if one should be public |
| Privacy policy | What personal data is stored (profile, applications, attendance, documents); who can see it (RLS summary); retention; deletion requests; processors (Supabase, Vercel, Google Fonts, Unsplash); contact for privacy requests; effective date |
| Terms of use | Eligibility and age; organization verification rules; acceptable use; no guarantee of placement or payment; moderation and suspension; liability limits; governing law; effective date |
| Emergency network (A11, when built) | The exact wording "not an emergency service" and the local emergency number to show |
| Reports (D09) | Not content. It needs an agreed list of metrics and a read-only query review before building (aggregate RPC, no new tables) |
