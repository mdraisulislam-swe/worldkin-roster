# Prototype → React visual gap report

**Visual source of truth:** `Worldkin-Roster-Original-Prototype.zip` (45 screens). The ZIP was verified byte-identical to the prototype served on port 4300.
**Functional source of truth:** this React app (Supabase, RLS, RPCs unchanged).
**Status:** analysis only. No code was changed for this report.

## How the prototype is built

- **Responsive layouts:**
  - A Desktop / Tablet / Mobile toolbar resizes the frame to 100%, 820 px and 390 px.
  - The layouts react to the frame through container queries at **1100 / 900 / 560 px**.
  - React equivalent: viewport breakpoints `lg` 1024, `md` 768 and `sm` 640. These are close enough, so no change is needed.
- **Public pages:** sticky header (Discover, Events, Organizations, Map, Stories, About), dark-green hero, cards with cover photos, and a dark-green footer.
- **Workspaces** (volunteer, organization, admin) use a full **app shell**:
  - a full-height left sidebar with logo, section label, organization switcher, icon menu with count badges, and a user card plus Sign out at the bottom;
  - a slim top bar with the page name, "Find opportunities" and the bell;
  - **no public header or footer** inside workspaces.
- **Lists in workspaces** are **tables**: initials avatar, columns, status pills, a "Review" button and pagination.
- **Dashboards** start with **KPI tiles** (icon, label, big number, caption), followed by two-column cards.

## Biggest cross-cutting gap

1. **Workspace app shell** (affects 24 screens). The React workspaces render inside the public header and footer, with the sidebar as a card in the page. The prototype uses a full-height sidebar app shell instead.
2. **Tables for management lists.** The React app shows applicants and applications as stacked cards. The prototype uses tables on desktop and stacked rows on phones.
3. **Dashboard KPI tiles.** The React app uses the plain `Stat`. The prototype tile has an icon and a caption, the same style already used on the home page.
4. **Photography.** Prototype cards and profiles use photos. The database has no image fields yet (needs the wk08 media migration), so this stays **BLOCKED**. The React app uses cause-coloured cover bands instead.

## Screen-by-screen comparison

Legend:
- **MATCHED:** visually equivalent.
- **PARTIAL:** same content, layout or styling differs.
- **NOT IMPL:** no React screen yet, but it could be built from existing data.
- **BLOCKED:** needs a migration, data or a feature that does not exist.

### Public website (A)

| Code | Prototype | React route | Status | Remaining difference |
|---|---|---|---|---|
| A01 | `#/home` | `/` | PARTIAL | Hero, Impact, Why Worldkin, Journey, cards, events and organizations are done. Missing: hero floating next-shift card (doable, real data); cover photos (BLOCKED wk08); community stories, partners, Support a cause (BLOCKED: no data). |
| A02 | `#/discover` | `/explore` | PARTIAL | The prototype has a compact one-row search bar (keyword, location, date, sort), kind chips, a segmented pay filter, and a "N results" line. The React app has a taller multi-row form. Kind chips are BLOCKED (wk10). The map toggle is BLOCKED (wk12). |
| A03 | `#/opportunity` | `/opportunities/:id` | PARTIAL | Cover and tags are done. Missing: a sticky **"Next shift" card** with seat meter and Apply button, the **contact the organization** panel, and **related opportunities** (all from existing data). Hero photo is BLOCKED. |
| A04 | `#/organizations` | `/organizations` | PARTIAL (minor) | Heading wording and search-bar layout; cards are close. |
| A05 | `#/org-profile` | `/organizations/:slug` | PARTIAL | Prototype: header band with logo, name and verified mark, a two-column layout with a right-hand **trust record and contact** sidebar, and past activities. The React app has the same sections stacked in one column. Cover photo is BLOCKED. |
| A06 | `#/events` | `/events` | PARTIAL | Prototype groups events as **Happening now** / Upcoming (next 60 days) / Recently held, in date-badge rows. The React app has Upcoming and Recently held. "Happening now" can be derived from shift times. |
| A07 | `#/event` | `/events/:id` | PARTIAL | Prototype has a two-column layout with a right-hand join card. Styling differs; the content is equivalent. |
| A08 | `#/media` | — | BLOCKED | Needs wk08 media (storage, moderation). |
| A09 | `#/video` | — | BLOCKED | Needs wk08 media. |
| A10 | `#/map` | — | BLOCKED | Needs wk12 coordinates and the Leaflet dependency (approval required). |
| A11 | `#/emergency` | — | BLOCKED | Needs wk12 and an emergency-network feature. Must be labelled "not an emergency service". |
| A12 | `#/about` | — | NOT IMPL | Mission, vision and how verification works can be written from real behaviour. **Contact, Privacy and Terms need text you provide**; I will not invent them. |

### Authentication (B)

| Code | Prototype | React route | Status | Remaining difference |
|---|---|---|---|---|
| B01 | `#/login/volunteer` | `/signin` | PARTIAL | Split layout done. The prototype's right panel is a **photo** with a role message; the React app uses a dark-green panel with three facts. The prototype has separate volunteer and organization sign-in pages; the React app has one sign-in (keep that, it is the functional truth). |
| B02 | `#/login/org` | `/signin` | PARTIAL | As B01. Could add role-specific wording via `?as=organization` without a new route. |
| B03 | `#/admin/login` | — | BLOCKED | A separate admin sign-in with MFA needs Auth MFA setup (Supabase settings, approval). Admins use `/signin`. |
| B04–B06 | `#/register` | `/join`, `/signup?as=…` | PARTIAL | Prototype has a role picker and multi-step registration in the split layout. The React Join page is a standalone card page. |
| B07 | `#/otp` | `/verify-email` | MATCHED | Six boxes, resend timer and split layout. |
| B07 | `#/recover` | `/forgot-password`, `/auth/reset` | MATCHED | Same flow and layout. |

### Volunteer workspace (C)

| Code | Prototype | React route | Status | Remaining difference |
|---|---|---|---|---|
| C01 | `#/v/dashboard` | `/me` | PARTIAL | **App shell.** KPI tile style. Prototype layout: Next steps + Profile completion card side by side, then KPI row, Upcoming, Recent updates, **Recommended for you**. The React app has most of this content except the recommended list (doable via skills search). |
| C02–C03 | `#/v/applications` | `/me/applications` | PARTIAL | Prototype: **status tabs** (All, In review, Offers, …) plus a **table**. React: offers card plus a card list. |
| C04 | `#/v/calendar` | `/me/calendar` | PARTIAL (shell only) | Month grid plus Today agenda already match; only the app shell differs. |
| C05 | `#/v/passport` | `/me/record` | PARTIAL | Prototype: KPI row, monthly hours chart, skills, experience table. React has the chart, skills and table; the KPI row style and the app shell differ. |
| C06 | `#/v/certificates` | `/me/certificate/:id` (+ list inside other pages) | PARTIAL | The prototype has a **certificates list page** (table). The React app lists certificates inside participation history, and each certificate page exists. |
| C07 | `#/v/notifications` | `/me/notifications` | PARTIAL | Prototype has **All / Unread tabs** and row styling; React is a list with "Mark all read". |
| C08 | `#/v/profile` | `/me/profile` | PARTIAL | Prototype groups Profile, **Privacy** and Account as sections. Some of its privacy toggles are concepts without a backend, and those stay out. |

### Organization workspace (D)

| Code | Prototype | React route | Status | Remaining difference |
|---|---|---|---|---|
| D01 | `#/o/dashboard` | `/org/:id` | PARTIAL | **App shell** with the organization switcher in the sidebar. Header with verified mark and actions (**New opportunity**, **Public page**). KPI tiles (active opportunities, applicants to review, upcoming shifts, confirmed volunteers). Coming up with seat meters. **Applicants to review** summary card. Recent activity. React has the stats, Coming up and Opportunities; the summary cards and header actions differ. |
| D02 | `#/o/opportunities` | section of `/org/:id` | PARTIAL | Prototype has a dedicated page with status tabs and a table. React lists opportunities on the overview. A separate route would be new (optional). |
| D03 | `#/o/create` | `/org/:id/opportunities/new` | PARTIAL | Prototype: sectioned form cards (Basics; Where & when; Selection & compensation) with a **live card preview**. React: one form. |
| D04 | `#/o/applicants` | `/org/:id/applications` | PARTIAL | Prototype: privacy notice banner, search, status and opportunity filters, a **table** (applicant, verified hours, skill match, applied, status, Review), pagination. React: filters plus a card list with inline actions. |
| D05 | `#/o/applicant` | inline in `/org/:id/applications` | PARTIAL | Prototype has a **detail page** with private notes, status history and decision buttons. React has these actions inline. A detail view would be new UI over existing RPCs. |
| D06 | `#/o/offers` | applications + `/org/:id/shifts/:shiftId` | PARTIAL | Prototype groups offers and shifts in two tables. React spreads them across pages. |
| D07 | `#/o/attendance` | `/org/:id/shifts/:shiftId` (roster) | PARTIAL | Prototype: attendance table with hour inputs and bulk confirm. React: roster table with per-row actions (functionally equivalent). |
| D08 | `#/o/profile` | `/org/:id/settings` | PARTIAL | Prototype: tabs for Public / Private / Contact, with a logo card. React: the same sections stacked. |
| D09 | `#/o/reports` | — | NOT IMPL | KPI tiles, verified hours per month, application funnel, top opportunities. Mostly computable from data the organization can already read; the queries need review first. |

### Admin workspace (E)

| Code | Prototype | React route | Status | Remaining difference |
|---|---|---|---|---|
| E01 | `#/a/overview` | `/admin` | PARTIAL | **App shell** with the dark-green admin sidebar, KPI tiles, Your queue, Platform health. The role-specific views are BLOCKED (wk13). |
| E02 | `#/a/verify` | `/admin/organizations` | PARTIAL | Prototype: queue cards with document checklist and decision buttons, plus History. React has the same functions with different card styling. |
| E03 | `#/a/users` | `/admin/users` | PARTIAL (minor) | Table already restyled; shell and filters differ. |
| E04 | `#/a/moderation` | `/admin/opportunities` + `/admin/feedback` | PARTIAL | Prototype merges them with tabs; React has two pages. |
| E05 | `#/a/disputes` | `/admin/complaints` | PARTIAL | Card styling plus Resolution history. |
| E06 | `#/a/audit` | `/admin/audit` | PARTIAL (shell only) | Table already matches. |
| E07 | `#/a/access` | — | BLOCKED | Needs wk13 admin roles. |

### System

| Code | Prototype | React | Status | Note |
|---|---|---|---|---|
| 00 | `#/system/index` | — | Not applicable | Prototype navigation tool. |
| 01·09 | `#/system/components` | `docs/DESIGN_SYSTEM.md` | Not applicable | Design reference. |
| 09 | `#/system/states` | Loading / Empty / Error / offline banner / 404 | MATCHED | Restyled in batch 1. |
| — | `#/404` | `NotFoundPage` | MATCHED | |

### Totals (45)

| Status | Count | Screens |
|---|---|---|
| MATCHED | 4 | B07 OTP, B07 recover, system states, 404 |
| PARTIAL | 31 | A01–A07; B01, B02, B04–06; C01–C08 (7); D01–D08; E01–E06 |
| NOT IMPL | 2 | A12 About, D09 Reports |
| BLOCKED | 6 | A08, A09, A10, A11, B03, E07 |
| Not applicable | 2 | system index, component gallery |

## Proposed implementation order

Highest visual impact first, reusing existing data and actions only. No migrations.

| Step | Change | Screens | Risk |
|---|---|---|---|
| 1 | **Workspace app shell**: full-height sidebar (org switcher, icon menu with counts, user card plus Sign out), slim top bar (page name, Find opportunities, bell). No public header or footer under `/me`, `/org/:id` and `/admin`. Phones get a drawer menu. Same routes and guards. | 24 (C, D, E) | Low–medium (layout only) |
| 2 | **Dashboard KPI tiles and layout** (icon, number, caption; two-column cards): volunteer overview, organization overview (+ New opportunity, Public page), admin overview | C01, D01, E01, C05 | Low |
| 3 | **Applicants table** (desktop table, phone rows, privacy banner) and **volunteer applications tabs + table**, reusing the current queries and actions | D04, C02, D02 | Medium (must keep every action) |
| 4 | **Discover compact search bar** and **Events "Happening now"** grouping | A02, A06 | Low |
| 5 | **Opportunity detail sidebar** (next-shift card with seat meter and Apply) and related opportunities; **org profile two-column** with trust sidebar | A03, A05, A07 | Low–medium |
| 6 | Notifications tabs, profile sections, org settings tabs, opportunity form sections with live preview | C07, C08, D08, D03 | Low |
| 7 | About page (needs your Contact, Privacy and Terms text), Reports page (needs query review) | A12, D09 | Content-dependent |
| — | Blocked until approved: media (wk08), map and emergency (wk12 + Leaflet), admin roles and admin MFA (wk13 + Auth settings), opportunity kind tags (wk10) | A08–A11, B03, E07 | — |

## Verification limits

- Public pages were compared by rendering both sides in a browser.
- Workspace pages were compared using prototype renders against the React source. A signed-in Preview session was not available, so React workspace visuals with real data are **not verified**.
