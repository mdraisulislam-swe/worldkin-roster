# Prototype replication — VERIFIED checklist

**Reference:** `Worldkin-Roster-Original-Prototype.zip` (45 screens). It is byte-identical to the prototype served on port 4300.

**Rule:** a screen marked VERIFIED is not revisited unless it regresses or the prototype changes.

**Method:**
- prototype and React rendered side by side at 1440 px;
- a layout sweep at 375 / 820 / 1024 / 1440 px (no horizontal overflow, one `h1`, one `main`);
- type-check, lint, unit tests and build.

**Sources of React renders:**
- public pages use the real app with real data;
- workspace pages use a throwaway harness with labelled sample data;
- signed-in real-data spot checks were run on Preview on 27 Nov.

## Shared foundation

| Component | Status | Commit |
|---|---|---|
| Design tokens, Manrope/Inter, buttons (incl. secondary border fix), inputs, alerts, empty states | VERIFIED | 1f2cd36, c31cb1d |
| Workspace shell (sidebar 260/220 px, top bar, bottom tab bar, slide-out menu, workspace switcher) | VERIFIED | e674f3f, 07719e9 |
| Stat tile (`kpi`) | VERIFIED | c26d1b2 |
| Tabs, tables (`tbl tbl-cards`), status badge, initials avatar | VERIFIED | c31cb1d |
| Opportunity card + cause cover band | VERIFIED (photos NOT CONNECTED — no image data) | e3876a8 |

## Screens

| Code | Prototype | React route | Status | Notes / NOT CONNECTED |
|---|---|---|---|---|
| A02 | `#/discover` | `/explore` | VERIFIED | Kind chips (wk10), map view (wk12) NOT CONNECTED |
| A06 | `#/events` | `/events` | VERIFIED | — |
| B07 | `#/otp` | `/verify-email` | VERIFIED | — |
| B07 | `#/recover` | `/forgot-password`, `/auth/reset` | VERIFIED | — |
| C01 | `#/v/dashboard` | `/me` | VERIFIED | Recommended for you NOT CONNECTED |
| C02–03 | `#/v/applications` | `/me/applications` | VERIFIED | — |
| C04 | `#/v/calendar` | `/me/calendar` | VERIFIED | — |
| C05 | `#/v/passport` | `/me/record` | VERIFIED | Public share link (wk09) NOT CONNECTED |
| **C06** | `#/v/certificates` | `/me/record` (Certificates section) + `/me/certificate/:id` | **VERIFIED (R1)** | The "Planned verification links" note, table (Certificate / Issued / Hours / Status) and Issued date are matched. **Leave feedback** is kept (existing feature). The side certificate preview and QR are NOT CONNECTED; the printable certificate page is linked instead. |
| **C07** | `#/v/notifications` | `/me/notifications` | **VERIFIED (R1)** | All / Unread tabs with count, single-card rows with kind icon, unread tint and dot, relative time and footer caption are matched. Mark all as read is kept. Opening a row marks it read (existing). |
| **C08** | `#/v/profile` | `/me/profile` | **VERIFIED (R1)** | Matched: photo row in the form; Full name / City; About; Skills; Languages / Availability; private Phone; Account card with masked email. Extra app fields (interests, country, education, experience) are kept after the prototype fields. Privacy switches, Delete account and skill chips are NOT CONNECTED. |
| D01 | `#/o/dashboard` | `/org/:id` | VERIFIED | Recent activity NOT CONNECTED |
| D04 | `#/o/applicants` | `/org/:id/applications` | VERIFIED | Search box NOT CONNECTED |
| D02 | `#/o/opportunities` | `/org/:id` (Opportunities list on the overview) | PARTIAL (R2) | No separate route; the list stays on the overview to keep route contracts. Not re-compared in R2. |
| **D03** | `#/o/create` | `/org/:id/opportunities/new`, `/org/:id/opportunities/:oppId` | **VERIFIED (R2)** | Matched: three section cards (Basics / Where & when / Selection & compensation), segmented mode control, selection radio cards, Save and publish / Save as draft, a **Live preview** card in the right column built only from form data, and a publishing note. "Opportunity type" select and skill chips are NOT CONNECTED (no schema field / free-text skills kept). Cover photo NOT CONNECTED. |
| D05 | `#/o/applicant` | `/org/:id/applications` (inline detail) | PARTIAL (R2) | Detail is inline in the applicants table; no separate route. |
| **D06–D07** | `#/o/offers`, `#/o/attendance` | `/org/:id/shifts/:shiftId` | **VERIFIED (R2)** | Matched: capacity and cancel cards, "Roster & attendance" table with initials, Present / No-show buttons, auto-promotion note and the audit-log alert. Same mutations and confirmation dialogs as before. Dispute flow NOT CONNECTED (labelled "planned"). |
| **D08** | `#/o/profile` | `/org/:id/settings` | **VERIFIED (R2)** | Matched: Public profile / Public contact / Private & verification tabs, one Save changes, Logo and Verification documents cards, Preview public profile action. Errors on a hidden tab are listed in an alert with links. Fixed during R2: tab strip and file inputs overflowed at 375 / 1024 px. |
| E01 | `#/a/overview` | `/admin` | VERIFIED | Role views (wk13), platform health NOT CONNECTED |
| E06 | `#/a/audit` | `/admin/audit` | VERIFIED | — |
| 09 | `#/system/states` | shared states | VERIFIED | — |
| — | `#/404` | `NotFoundPage` | VERIFIED | — |

## Remaining (next batches)

- **R3 Admin:** E02, E03, E04, E05.
- **R4 Public:** A01, A03, A04, A05, A07.
- **R5 Auth:** B01, B02, B04–B06.
- **R6 Content:** A12, D09.
- **NOT CONNECTED:** A08–A11, B03, E07.
