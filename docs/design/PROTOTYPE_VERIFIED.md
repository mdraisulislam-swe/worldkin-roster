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
| **A01** | `#/home` | `/` | **VERIFIED (R4)** | Already matched (hero with prototype photo, search, two calls to action, impact row with real counts). No code change. Floating "next shift" chip on the photo NOT CONNECTED. |
| **A03** | `#/opportunity` | `/opportunities/:id` | **VERIFIED (R4, with deviation)** | Header, badges, about / compensation / what-happens-next cards and right-hand shift column match the structure. Kept deviation: the right column lists every shift with its own Join button instead of one "Next shift" card (richer and already tested). Cover photo and related opportunities NOT CONNECTED. |
| **A04** | `#/organizations` | `/organizations` | **VERIFIED (R4)** | Changed: "Verified organizations" title and subtitle, two-column cards, note that organizations awaiting verification are not listed. Filters (cause/type/country) kept. Ratings on cards NOT CONNECTED. |
| A05 | `#/org` (organization profile) | `/organizations/:slug` | PARTIAL (R4) | Width sweep passes; two-column layout with opportunities. Trust sidebar details not re-compared. |
| A07 | event detail | `/events/:id` | PARTIAL (R4) | Width sweep passes. Not re-compared side by side. |
| **B01–B02** | `#/login/volunteer`, `#/login/org` | `/signin?as=volunteer`, `/signin?as=org` | **VERIFIED (R5)** | Matched: account-type eyebrow, "Welcome back", role-specific subtitle, Volunteer / Organization switch (links; keeps `next`), photo panel. Wording only: the same sign-in runs for both roles. "Keep me signed in" and demo-role chips NOT CONNECTED. |
| **B04–B06** | `#/register` | `/join`, `/signup?as=…` | **VERIFIED (R5, with deviation)** | Role choice is a separate `/join` page (two cards) rather than a step inside the form; signup panels now show the prototype photo (`hero` volunteer / `team` organization). 3-step progress header NOT CONNECTED. |
| B03 | `#/admin/login` | — | NOT CONNECTED | Admins use the normal sign-in; MFA is not built. |
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
| **E02** | `#/a/verify` | `/admin/organizations` | **VERIFIED (R3)** | Matched: status tabs; card per organization with initials, cause / country / date, website, a private "Submitted details & documents" panel (open for pending), Verify / Reject buttons. The right-hand queue/history column and the reviewer checklist are NOT CONNECTED (a checklist that is not saved would mislead). A reviewer cannot act on their own organization (unchanged). |
| **E03** | `#/a/users` | `/admin/users` | **VERIFIED (R3)** | Matched: search card, users table with initials, activity, status badge and Suspend / Lift suspension; footer note that admins cannot be suspended here. Role and status filter selects are NOT CONNECTED (server search is name/email only). |
| **E04** | `#/a/moderation` | `/admin/opportunities`, `/admin/feedback` | **VERIFIED (R3)** | "Content moderation" heading with section tabs that link the two existing routes (no URL change), Published / Closed tabs, Close listing and Hide / Restore. The Reports queue and Media review tabs are NOT CONNECTED (no report/media tables). |
| **E05** | `#/a/disputes` | `/admin/complaints` | **VERIFIED (R3, styling)** | Status tabs, complaint cards, Start review / Resolve / Dismiss with a required response. The prototype's two-sided no-show dispute is NOT CONNECTED (labelled planned in the shift page). |
| — | admin sidebar | `ADMIN_NAV` | **VERIFIED (R3)** | Labels aligned: User management, Content moderation, Feedback & reviews. Routes unchanged. |
| E06 | `#/a/audit` | `/admin/audit` | VERIFIED | — |
| 09 | `#/system/states` | shared states | VERIFIED | — |
| — | `#/404` | `NotFoundPage` | VERIFIED | — |

## Remaining (next batches)

- **R6 Content:** A12, D09.
- **NOT CONNECTED:** A08–A11, B03, E07.

## Photos (R5)

Auth panels use two photos taken from the prototype itself (`data.js` keys `hero` and `team`, Unsplash, free licence). The home hero already uses the `hero` photo. They are decorative (`alt=""`) and hide if they fail to load. No other images were added.
