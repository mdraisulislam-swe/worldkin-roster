# Consolidated implementation plan — remaining hackathon features

Branch `feature/applications-platform` @ `b673070`. Production `e616aad`.

Every item is mapped to the journey **Discover → Apply → Get selected → Participate → Get verified → Certificate → Passport**.

Each item also lists the existing schema it reuses, its permissions, its dependencies and its order. Items marked **no migration** can be built now. All others need the owner's approval of their proposal first.

## Order of work

| # | Feature | Journey step | Migration? | Est. | Depends on |
|---|---|---|---|---|---|
| 1 | Signed-in browser check of the current Preview | all | no | 30 min | owner signs in on the branch alias |
| 2 | Public event discovery (`/events`) | Discover | **no** | 2 h | — |
| 3 | Organization trust profile polish | Discover → Apply | **no** (phase A) | 1.5 h | — |
| 4 | Opportunity categories | Discover → Apply | yes: `wk10_opportunity_kind` | 3 h | approval |
| 5 | Certificate verification | Certificate → Passport | yes: `wk09` (proposal written) | 3 h | approval |
| 6 | Media & Stories | Participate → Passport (public trust) | yes: `wk08` (proposal written) | 4 h | approval, owner content |
| 7 | Connected workflow polish | all | no | 1.5 h | 1 |

## 2. Public event discovery — no migration

- **User need:** a visitor sees what is happening and when, before signing up.
- **Reuses:**
  - `shifts` (anyone can read upcoming shifts of public opportunities: `shifts_select` → `is_opportunity_public`);
  - `opportunities` and `organizations` embeds;
  - `groupByDay()`;
  - `CapacityMeter`, `CompensationBadge`, `OpportunityCardView` styles.
- **Build:**
  - `/events`: upcoming scheduled shifts for the next 30 days, grouped by day.
  - Each event shows title, organization (verified badge), time, place or remote, seats left and compensation.
  - Filters: cause, mode, compensation.
  - Each event links to its opportunity page, where the existing join/apply logic applies.
  - Add "Events" to the public nav and footer, and an "Upcoming events" strip on Home.
- **Security:** read-only. RLS already hides sensitive and unpublished opportunities and their shifts. No personal data.
- **Tests:**
  - unit test for the query mapper;
  - browser check signed out at 375/768/1440;
  - empty state.

## 3. Organization trust profile — phase A without migration

- **Reuses:** `organizations` (name, logo_url, description, website, city, country, org_type, status), the public opportunities list, and `org_feedback()` (verified-participant feedback with first names only).
- **Build (on `/organizations/:slug`):**
  - a verification badge with an explanation ("Reviewed by Worldkin before publishing");
  - a "Since" date;
  - upcoming events for this organization (reuses #2);
  - completed-events count from verified participation, through the existing public stats where available (otherwise omitted);
  - a "Report this organization" link (the existing complaints form with `?org=`).
- **Phase B (migration, later):** mission, social links and cover image, together with wk08 media.
- **Security:** only public columns. `organization_private` and `org-docs` are never touched.

## 4. Opportunity categories — `wk10_opportunity_kind`

- **Schema:** enum `opportunity_kind` = `volunteer | internship | fellowship | part_time | leadership | event | club`, as a column `opportunities.kind not null default 'volunteer'`.
  - It is separate from the existing `compensation_type` (voluntary | stipend | paid). A paid internship is therefore `kind=internship` plus `compensation=paid`; an unpaid internship is `internship` plus `voluntary`. Labels can never mislead.
  - A CHECK can forbid nonsense combinations if wanted.
- **RPCs:** `search_opportunities` gains `p_kind` (optional, defaulting to null, so the Production frontend stays compatible). The editor gets a kind select. Badges appear on cards.
- **Permissions:** unchanged. Org staff edit their own opportunities through the existing policies.
- **Rollback:** drop the column and the type, and restore the previous function body.
- **Tests:** a local PGlite suite for filters and defaults, then re-run the RPC-compatibility check against `e616aad`'s call signature.

## 5. Certificate verification — `wk09`

See `docs/proposals/CERTIFICATE_VERIFICATION.md`:
- opaque revocable codes;
- `verify_certificate()` returns first name, organization, title, hours and date only;
- `/verify/:code`.

It connects the Passport and certificates to employers and universities.

## 6. Media & Stories — `wk08`

See `docs/proposals/MEDIA_AND_STORIES.md`:
- private bucket with signed URLs;
- uploads by organization admins only, published by platform admins only;
- consent flag required.

**Journey link:** each album is tied to an organization and, optionally, an opportunity (event). It appears on the organization profile (#3), on `/media`, and on the Home strip once published content exists. No placeholder gallery is shown before then.

## 7. Connected workflow polish — no migration

- Opportunity page: a "What happens next" box that changes by selection mode (open join vs. application → offer within 72 h → attendance → verified hours → certificate).
- After accepting an offer: a direct link to the agenda and the calendar export.
- After hours are verified: the notification links to the Passport (the backend already links `hours_verified` to `/me/record`).

## Out of scope for the hackathon (documented)

- Emergency Volunteer Network (proposal in `PERMISSIONS_AND_ROADMAP.md` §4).
- Email reminders (need `pg_cron`).
- Two-way reviews.
- Saved opportunities.
- Leaderboards.

## Approvals needed, in recommended order

1. Your signed-in Preview check (no approval needed, just your sign-in).
2. Build #2, #3A and #7 (no migration).
3. Approve wk10, then wk09, then wk08 — one at a time, each with a local test run before applying.
4. Merge and deploy to Production after a final Preview check.
