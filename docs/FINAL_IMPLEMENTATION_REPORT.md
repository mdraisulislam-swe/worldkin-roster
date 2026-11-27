# Final implementation report — map, emergency, video, branding, events, search, footer

**Date:** 27 Nov 2026
**Branch:** `feature/applications-platform`. Starting HEAD `1aa2c7f`; final HEAD is the commit that adds this file.
**Scope:** local work only. No push, merge, deploy or Production change. The shared Supabase database (`ekkvwgohpzliwbmjnrth`) was **not** written to; it was only read through the public API. No migration was applied.

## A. Root cause — why map, video, emergency and branding kept being missed

1. **The prototype itself marks them as concepts, not built screens.**
   - The map (A10) is a hand-drawn SVG of a *fictional* district: `screens-map.js`, "Fictional sample district — no real geography".
   - The emergency network (A11) is labelled "Future module · proposal only (wk12-B)".
   - The video page (A09) is labelled "Player placeholder · hosting not implemented".
   - Media (A08) is labelled "Requires approved media module (wk08)".
   - The footer social icons are disabled spans titled "to be supplied by Worldkin".
   - Replication batches R1–R5 compared screens visually and, by rule, skipped anything with no backend. So these screens were classified "NOT CONNECTED" instead of being built as far as safely possible.
2. **Each one was blocked on an approval gate that was never split.**
   - `docs/proposals/REVIEWS_AND_LOCATION.md` and `MEDIA_AND_STORIES.md` bundled the UI with new tables (wk08/wk12) and a new map library ("Leaflet … needs your OK").
   - Because the whole bundle needed approval, nothing was built — not even the parts that need no database change. Those parts are a real map of public listings, the request form and its validation, a video player, the brand header and footer icons.
3. **The data model has no coordinates, no video URLs and no social links.**
   - Listings store only `city` and `country_code`.
   - There is no column for videos, social URLs, brand colour or cover image.
   - Without a decision on how to place markers, or where URLs come from, every earlier attempt stopped at the proposal.
4. **Verification was screen-first.** The R1–R5 checklist only covered screens with a React route. Screens with no route (A08–A11) never entered the comparison loop, so their absence never showed up as a failing check.
5. **Assets are genuinely missing.** There are no official video URLs, social URLs or organization cover images anywhere in the repository, the ZIP, Figma exports or the docs. The prototype uses Unsplash stock photos and fictional "(Sample)" data, which may not be shown as real.

**Fix applied this round:**
- Every item was split into a part that can ship safely now and a part that needs approval.
- Each item got its own route: `/map`, `/emergency`, `/media`.
- The approval part is a migration that is tested locally and not applied.

## B. Completed work

| Feature | Route | Files | What was built | Evidence | Result |
|---|---|---|---|---|---|
| **Real interactive world map** | `/map` (new); "Map" link in the top nav, footer and Explore | `components/WorldMap.tsx`, `lib/geo.ts`, `lib/mapPoints.ts`, `lib/mapKinds.ts`, `pages/MapPages.tsx`, `app/router.tsx` | See D | Browser checks (D); unit tests `geo`, `buildMapPoints` | PASS |
| **Emergency Volunteer Call** | `/emergency` (new); footer link | `lib/emergency.ts`, `pages/MapPages.tsx`, `supabase/proposals/wk12_*.sql`, `supabase/tests/local-pglite/wk12_proposal_tests.mjs` | See E | 32/32 local DB checks (`docs/evidence/local_wk12_proposal.txt`); 3 render tests; schema tests | PASS (UI) / NOT APPLIED (DB) |
| **Video section** | `/media` (new); footer "Stories & media" | `components/VideoPlayer.tsx`, `lib/video.ts`, `lib/siteContent.ts` | See F | URL-parser tests (YouTube variants, mp4, invalid, `javascript:`); render test (3 slots, no iframe, no fake play button) | PASS (component) / BLOCKED (no video URLs) |
| **Organization branding** | `/organizations/:slug` | `pages/OrganizationsPages.tsx` | See F | Screenshot at 1440 with real data; 5-width sweep | PASS |
| **Event detail completeness and capacity** | `/events/:id` | `pages/EventsPages.tsx`, `lib/events.ts` (3 public columns added to the select), `lib/seats.ts` | Cover band; "Event details" card (date/time, format, place, organizer + verified, how to take part, compensation and details, skills, responsibilities/requirements); capacity block (%, "X of Y seats confirmed", seats left / "Full — waitlist open", note that applications and offers don't hold seats) | `seatStats` tests (10/20 = 50 %, 11/20 = 55 %, 20/20 = full); real event shows 0 % · 0 of 8 · 8 seats left | PASS |
| **Home search proportions and country** | `/` | `pages/HomePage.tsx` | Two balanced rows: keyword + button, then Country (all ISO countries, Bangladesh first) + City. Passes `country` to Explore's existing filter | Browser: Bangladesh → `/explore?country=BD` with the dropdown preselected; 5 widths no overflow | PASS |
| **Explore country filter** | `/explore` | `pages/ExplorePage.tsx` | The 2-letter text box is now a named country dropdown; same `country` URL parameter, and unknown legacy codes are kept; "Map view" link carries the country | Browser + existing Explore tests | PASS |
| **Footer** | all public pages | `components/layout/AppShell.tsx`, `components/Icon.tsx`, `lib/siteContent.ts` | Facebook, Instagram, LinkedIn, YouTube and X icons from the prototype's own icon set. They show as disabled (not links) until official URLs are set; no `#` links. New links: Map, Stories & media, Emergency Volunteer Call; real GitHub "Source code" link | Browser screenshot; no broken links (all routes exist) | PASS (official URLs BLOCKED) |

**Dependencies added:**
- `leaflet` 1.9.4 and `leaflet.markercluster` 1.5.3, plus their types (dev).
- `npm audit` reports 0 vulnerabilities.
- The map code is a lazy chunk (`MapPages` ≈ 61 kB gzip), so other pages don't load it.

## C. Prototype comparison (all 45 screens)

**Viewports:**
- 1440 px: side-by-side comparison where the prototype has a real screen;
- 375 / 390 / 820 / 1024 / 1440 px: layout sweep for every page changed this round.

The 31 screens already VERIFIED in R1–R5 were not touched. Changes this round:

| Code | Screen | Before | Now | Notes |
|---|---|---|---|---|
| A10 | Map discovery | NOT CONNECTED | **MATCHED (function) / DEVIATION (intended)** | Real map instead of the prototype's fictional SVG, as requested. Same controls: kind chips, area selector (country), map/list toggle, legend, cluster explanation, approximate-area note. The "Within 5/10 km" radius filter needs stored coordinates → BLOCKED (wk12-A) |
| A11 | Emergency network | NOT CONNECTED | **PARTIAL** | All prototype sections (warning, 3 principles, open requests, area map, availability) plus a full request form. Sending and responding are BLOCKED until wk12-B is approved |
| A09 | Video experience | NOT CONNECTED | **PARTIAL** | Real player component; no official video URLs exist → content-required state |
| A08 | Media gallery | NOT CONNECTED | BLOCKED | Needs wk08 (uploads, moderation, consent). An honest notice is shown on `/media` |
| A05 | Organization profile | PARTIAL | **MATCHED** | Cover + 96 px logo + identity + trust marks + CTA; trust record, contact, report and reviews were already present. The cover uses the cause colour band (no cover-image column) |
| A07 | Event details | PARTIAL | **MATCHED** | Details card and capacity meter as in the prototype; no event photos (no data) |
| Footer | — | partial | **MATCHED** | Same column structure plus disabled social icons, exactly like the prototype |
| A12, D09, B03, E07 | — | BLOCKED / NOT IMPL. / NOT CONNECTED | unchanged | Content, metrics, or admin-roles migration needed |

**New totals (45):**

| Status | Count | Screens |
|---|---|---|
| VERIFIED / MATCHED | 33 | +A05, +A07 |
| PARTIAL | 5 | D02, D05, A10 (radius filter), A11, A09 |
| BLOCKED | 2 | A08, A12 |
| NOT IMPLEMENTED | 1 | D09 |
| NOT CONNECTED | 2 | B03, E07 |
| REFERENCE | 2 | — |

## D. Real map report

| Item | Result |
|---|---|
| Library | Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 (BSD-2 / MIT) |
| Tiles | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — browser check: 12/12 tiles loaded at world view |
| Attribution | "© OpenStreetMap contributors" (linked), always visible |
| Coverage, zoom and pan | Worldwide (`minZoom` 2, `maxZoom` 18, world wrap). **Zoom:** + / − buttons, scroll, pinch, keyboard. **Browser checks:** zoom 7 → 8 with +; a real mouse drag moved the map pane from (0, 0) to (−162, −90) px |
| Bangladesh | Country list (Bangladesh first) flies to Bangladesh at zoom 7 (browser: URL `?country=BD`, clusters split 2/2/8). Clicking a listing zoomed to Sylhet at street level and opened its popup |
| Geolocation | Asked only after "Use my location". **Granted:** blue marker "shown only on this device", map flies there, no request carried the coordinates (checked in the network log). **Denied:** message "Location permission was not given. The map still works…" and the map stays usable. Both were tested with a stubbed browser API, because the pane cannot answer a real permission prompt; a real-device prompt is NOT RUN |
| Data source | Public RPCs only: `search_opportunities`, `list_organizations`, public shifts (RLS-filtered). **Live result:** 12 points in Bangladesh (opportunities, events, organizations). Remote opportunities are not placed; listings with an unknown place are counted and stay in the list |
| Placement privacy | Markers sit at a city centre (16 Bangladesh cities + 30 world cities, with alternative spellings) or the country centre; the popup says "approximate city area" / "country level". No coordinates appear in the page |
| Volunteer locations | **None shown.** There is no opt-in data today. The panel says the layer is not active. Proposal wk12-A adds opt-in profiles rounded to 0.05° (~5 km) and a public `emergency_area_counts` with k-anonymity ≥ 3 (local tests A1–A8 PASS) |
| States | Loading pill, tile-error alert, empty list state, API error with Retry |
| Limitations | OSM public tiles have a fair-use policy (fine for a demo; a production deployment should use a tile provider key). The city gazetteer is curated, so smaller towns fall back to country level. No radius search until coordinates exist |

## E. Emergency Volunteer Call report

| Item | Status |
|---|---|
| Entry points | `/emergency`; footer "Emergency Volunteer Call"; it is not placed on the homepage, to avoid clutter |
| Safety | Permanent red notice: not an emergency service, contact local emergency services first, no response guaranteed. No phone numbers are invented. A form checkbox requires the user to acknowledge this |
| Request form | Organization, category (7), urgency, title (8–90), description (30–1200), country, city/area (approximate only), volunteers needed (1–200), expiry (1–72 h), contact method (in-app / official email / official phone), skills (≤ 8), safety notes (≤ 600). **Who sees it:** only admins or coordinators of a *verified* organization (render tests) |
| Workflow | The form validates and then says "passed every check, but **it was not sent** … No volunteer has been contacted". There is no fake success. Lifecycle Open → Responders found → In progress → Resolved / Cancelled is shown and enforced in `lib/emergency.ts` and in the proposal RPC |
| Database | **Proposal only:** `supabase/proposals/wk12_location_emergency.sql` plus rollback. It adds 4 tables, RLS on all of them, no direct writes, and 6 SECURITY DEFINER RPCs with `search_path=''` |
| Database guarantees (local PGlite, 32/32) | Verified organizations only (B1); members only (B2, B16); anon denied (B3); rate limits (3 per organization per 24 h, 1 per person per hour, B6); 72 h cap (B7); notifications only to opted-in matching volunteers (B5); idempotent responses (B11); organization sees first names of "available" responders only (B12); invalid transitions rejected (B15, B18); status history (B19); closed requests hidden (B20, B21); rollback clean (R1) |
| Not done | Applying the migration (needs approval); real request and response UI wiring (enable `EMERGENCY_BACKEND_LIVE` after the migration); browser test of the form with a verified organization account — BLOCKED (no such session) |

## F. Video and organization branding

- **Video (`/media`):**
  - three categories as the prototype implies (platform, volunteers, organizations), one slot each;
  - the player supports YouTube (privacy-enhanced embed, loaded only after Play), https `.mp4`/`.webm`, and loading / failed / invalid / not-published states;
  - **playback NOT verified:** no official URL exists. Needed: one URL for each of `intro`, `volunteer` and `organization` in `src/lib/siteContent.ts`.
- **Branding (`/organizations/:slug`):**
  - **Matches the prototype:** cover band in the organization's cause colours, 96 px logo (or initials) overlapping the cover, name, type · cause · city · country, verified mark, review rating, "See open opportunities" and "Website" actions. Upcoming events, opportunities, feedback, trust record, contact and private report were already present.
  - **Not available:** brand colour and cover image (no schema fields, wk08); social links per organization (no columns).
  - **Nothing invented:** no sponsors or partners.

## G. Official rubric scorecard (estimate — not guaranteed)

| ID (max) | Estimate | Change this round | Basis |
|---|---|---|---|
| M01 Functional system (12) | 10.5–11.5 | + map, emergency UI | Verified live DB flows; organization UI on Preview still not checked |
| M02 Database (8) | 7.5–8 | — | Verified (unchanged) |
| M03 Auth (8) | 7–8 | — | Verified; Production behind |
| M04 Business logic (10) | 9.5–10 | + capacity semantics shown | Verified |
| M05 Dynamic data (6) | 5.5–6 | + map of live data, country filter | Verified in browser (local build, real data) |
| M06 Errors (8) | 7.5–8 | + geolocation denied, tile error, invalid video states | Verified locally |
| M07 Responsive / a11y (4) | 3.5–4 | + 45 new sweep checks PASS | Verified locally (5 widths) |
| M08 Deploy / docs (4) | 2.5–4 | — | Production not updated (BLOCKED on approval) |
| **Mandatory** | **≈ 53–59.5 / 60** | | |
| A03 Security (20) | 17–20 | Proposal follows the same RLS / RPC pattern; not live, so not scored | Verified live L1–L18 (unchanged) |
| A05 Concurrency (20) | 18–20 | Unchanged; capacity rules untouched (display only) | Verified live (unchanged) |
| **Total** | **≈ 88–99.5 / 100** | | Only if Production is updated and the video and links are submitted |

**Submission:**

| Item | Status |
|---|---|
| Video | NOT DONE |
| Public repository | NOT VERIFIED |
| Live URL matching the repository | FAIL until merge (Production = `e616aad`) |

## H. Technical QA (this round)

| Check | Result |
|---|---|
| TypeScript | PASS (0 errors) |
| Lint (oxlint) | PASS (0 warnings) |
| Unit and render tests | PASS 142/142 (18 files; +15 new) |
| Integration — local database | PASS 32/32 (wk12 proposal, PGlite 17, live database untouched) |
| Production build | PASS |
| `npm audit` (runtime) | 0 vulnerabilities |
| Secret scan | PASS (only the existing fake test fixture) |
| Browser — map | PASS: tiles, zoom, drag, Bangladesh, cluster/list → popup, kind filter, geolocation granted/denied (stubbed) |
| Browser — real geolocation prompt | NOT RUN |
| Browser — emergency form as a verified organization | BLOCKED (no session) |
| Responsive | PASS 45/45 (`/map`, `/map?country=BD`, `/emergency`, `/media`, `/`, `/explore`, event detail, organization profile × 375/390/820/1024/1440; home re-checked after its fix) |
| Accessibility | Each page has one `h1` and one `main`. **Map:** a labelled region, keyboard-focusable, markers titled; filter chips use `aria-pressed`; alerts use status roles; the video button is labelled. No automated axe run (NOT RUN; not installed) |
| Console errors | PASS (none on the tested pages) |
| Failed network requests | PASS (all 200/304) |
| Preview / Production | NOT RUN (nothing pushed) |

## I. Remaining dependencies (only items that need you)

1. **Approve the wk12 migration** (`supabase/proposals/wk12_location_emergency.sql`). It switches on volunteer opt-in, area counts on the map and live emergency requests. After approval: move it to `supabase/migrations/`, apply it, set `EMERGENCY_BACKEND_LIVE = true` and wire the RPCs.
2. **Video URLs:** platform introduction, volunteer orientation and organization guide (YouTube or https mp4).
3. **Official social URLs:** Facebook, Instagram, LinkedIn, YouTube, X — or say which channels don't exist.
4. **Media module (wk08) approval:** needed for organization photos and covers.
5. **A demo account** that is admin or coordinator of a verified organization, for the browser test of the emergency form and the organization pages on Preview.
6. **Push and Production approval:** commits are local only.
7. *(Optional)* A map tile provider key for production traffic beyond OSM fair use.

## J. Git status

- **Branch:** `feature/applications-platform`. Start `1aa2c7f` (= origin).
- **Changed:** `package.json`, `package-lock.json`, `router.tsx`, `Icon.tsx`, `AppShell.tsx`, `events.ts`, `EventsPages.tsx`, `ExplorePage.tsx`, `HomePage.tsx`, `OrganizationsPages.tsx`.
- **New:** `WorldMap.tsx`, `VideoPlayer.tsx`, `MapPages.tsx`, `MapPages.test.tsx`, `lib/geo.ts`, `mapKinds.ts`, `mapPoints.ts`, `emergency.ts`, `seats.ts`, `siteContent.ts`, `video.ts`, `mapEmergency.test.ts`, `supabase/proposals/wk12_*.sql` (2), `supabase/tests/local-pglite/wk12_proposal_tests.mjs`, `docs/evidence/local_wk12_proposal.txt`, this report.
- **Push:** NOT pushed. **Deployment:** none. **Production:** not modified. **Supabase:** not modified (read-only public API calls during browser tests).

## K. Final readiness

| Area | Status |
|---|---|
| Functional readiness | Core flows ready and verified. Map ready. Emergency, video and media await approval or content |
| Prototype fidelity | 33/45 matched; 5 partial; the rest blocked on content or migrations |
| Security readiness | Verified live for existing features. The emergency module is designed and tested locally, not live |
| Responsive readiness | Verified locally at 5 widths for all changed pages |
| Hackathon judging readiness | High for the declared A03 / A05. Depends on Production being updated |
| Submission readiness | **Not ready:** video, public repository check and Production update still required |
