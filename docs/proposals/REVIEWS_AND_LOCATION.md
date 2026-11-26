# Proposals: two-sided reviews (wk11) and location / Emergency Volunteer Network (wk12) — REQUIRE APPROVAL

Status: proposals only. Nothing here is applied. Each migration ships separately, with local PGlite tests, a rollback script and a production-impact note (same format as wk08 and wk09).

---

## Part 1 — Two-sided reviews and accountability (`wk11_two_sided_reviews`)

### What exists today (verified in code)

- **Volunteer → organization:** `feedback`.
  - One row per `participation_id` (UNIQUE), so there is exactly one review per verified participation.
  - Rating 1–5 and a comment of at most 1000 characters.
  - Statuses `published` / `hidden`, with admin moderation fields.
  - Created only through `submit_feedback()`, which requires the caller's own participation record.
- **Attendance:**
  - `record_attendance()` sets a signup to `attended` (which writes an append-only `participation_records` row with hours) or `no_show`.
  - It is staff-only for the organization, refuses self-verification (`WK_SELF_VERIFICATION`) and refuses a second recording (`WK_ALREADY_RECORDED`).
  - The decision is written to `audit_log`.
- **Missing:**
  - Organization → volunteer reviews.
  - Disputes of attendance or reviews.
  - Any reliability indicator. None is shown anywhere today, which is correct.

### Design

```sql
create type public.review_status as enum ('pending_reveal', 'published', 'hidden', 'disputed');

create table public.volunteer_reviews (            -- organization → volunteer
  id               uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.participation_records(id) on delete restrict,
  org_id           uuid not null references public.organizations(id) on delete restrict,
  volunteer_id     uuid not null references public.profiles(id) on delete restrict,
  reviewer_id      uuid not null references public.profiles(id) on delete restrict,   -- staff member, audited
  punctuality      smallint check (punctuality between 1 and 5),
  teamwork         smallint check (teamwork between 1 and 5),
  would_host_again boolean,
  comment          text check (char_length(comment) <= 600),
  status           public.review_status not null default 'pending_reveal',
  created_at       timestamptz not null default now(),
  check (reviewer_id <> volunteer_id)
);

create table public.review_disputes (
  id           uuid primary key default gen_random_uuid(),
  target_kind  text not null check (target_kind in ('volunteer_review','feedback','attendance')),
  target_id    uuid not null,
  raised_by    uuid not null references public.profiles(id),
  reason       text not null check (char_length(btrim(reason)) between 10 and 1000),
  status       public.complaint_status not null default 'open',      -- reuse existing enum
  resolution   text,
  created_at   timestamptz not null default now(),
  unique (target_kind, target_id, raised_by)                         -- one dispute per party per item
);
```

### Fairness rules, enforced in RPCs (not in the UI)

1. **Eligibility.**
   - An organization can review a volunteer only for an **`attended`** participation record (verified hours).
   - A `no_show` can never receive a review.
   - Reviews are only possible within 30 days of `verified_at`.
2. **No duplicates.** `UNIQUE (participation_id)` on both sides.
3. **No retaliation (double-blind reveal).**
   - Both sides' reviews stay in `pending_reveal` until both are submitted, or until 14 days pass. Then both publish together, so neither side can react to the other's review.
   - Without a scheduler, the reveal check runs lazily in the read RPCs.
4. **Evidence-based attendance only.**
   - "Attended" and "no-show" come only from `record_attendance()`, which is audited.
   - Volunteers can **dispute** a `no_show`. While the dispute is open, the no-show is excluded from every count.
   - A platform admin resolves the dispute. Any correction goes through a new audited admin RPC; history is never deleted.
5. **No automatic labels.**
   - There is no "unreliable" badge.
   - The volunteer's own profile may show a "completed N of M confirmed shifts" figure. It counts only undisputed, recorded outcomes and is visible to the volunteer and to organizations they **apply to**. It is never public.
6. **Visibility.**
   - Volunteer reviews are visible to the volunteer and to staff of organizations they apply to (through the existing `org_applications` RPC), never publicly.
   - Organization feedback stays public, with the reviewer's first name only, as today.
7. **Moderation and abuse.**
   - Report → `review_disputes`, then admin hides or upholds.
   - Every decision goes into `audit_log`.
   - Rate limit: one review per participation by construction.

### Tests

- A `no_show` cannot be reviewed.
- A duplicate review is refused.
- Content stays hidden until both reviews are submitted or 14 days pass.
- A disputed no-show is excluded from counts.
- A coordinator of org A cannot review org B volunteers.
- A volunteer cannot read reviews of others.
- Rollback restores the prior schema.

---

## Part 2 — Location discovery and Emergency Volunteer Network (`wk12_location`)

### What exists today

- `opportunities` and `profiles` have only `city` and `country_code` as text.
- There are no coordinates and no PostGIS.
- Discovery is filtered by city and country text (`search_opportunities`).

### Step A — nearby discovery (low risk)

- **Data:** add `lat`/`lng` to **opportunities only**.
  - They are entered by organization staff with an "approximate area" picker, rounded to 0.01° (about 1 km).
  - Sensitive opportunities keep coordinates null, matching today's rule of hiding the address.
- **Query:** a `nearby_opportunities(p_lat, p_lng, p_radius_km)` RPC.
  - Haversine on rounded points, so no PostGIS is needed at this scale.
  - Returns the same public card shape, plus a distance band ("< 5 km", "5–20 km", …), never exact metres.
- **Volunteer location:** taken **from the browser, per search**, after the user clicks "Use my location". It is never stored.
- **Map:** the static list is the default, and the map is optional. A map library such as Leaflet with OSM tiles is a new dependency that needs your OK, and OSM tile usage policy applies.

### Step B — Emergency Volunteer Network (future module)

**Notice shown everywhere:**

> Worldkin Roster is not an emergency service. In an emergency, contact local emergency services.

**Data:**
- `emergency_profiles`:
  - opt-in, off by default, owner-only RLS;
  - approximate area: a city, or a point rounded to about 5 km;
  - radius, skills, availability windows;
  - optional, consent-flagged, never public: blood group, plus the existing private phone.
- `emergency_requests`:
  - fields: organization, kind, area (rounded), radius, skills, number needed, compensation (voluntary / stipend / paid, with the same labelling rule), urgency, `expires_at` (at most 72 h), status;
  - only **org admins of verified organizations** can create them;
  - rate-limited to 3 open requests per organization and 1 per 10 minutes;
  - a duplicate guard on (org, kind, area, window);
  - written to the audit log.
- `emergency_responses`:
  - (request, volunteer) UNIQUE;
  - statuses `interested` / `declined` / `confirmed`.

**Matching and privacy:**
- A SECURITY DEFINER RPC notifies matching opted-in volunteers in-app, through the existing `notifications` table.
- The organization sees **counts only**, until a volunteer responds "interested".
- Only then is that volunteer's first name, skills and, if consented, contact shared, **with that organization only**.
- No exact location is ever stored or shown. There is no volunteer directory or map of people.

**Abuse:**
- Volunteers can report a request; admins can suspend the request or the organization's ability to post.
- Repeated false requests lead to a suspension through the existing org status.

**Tests:**
- Not opted in → never matched.
- The organization cannot read volunteer identities before an "interested" response.
- Expired requests can't be answered.
- Rate limits hold.
- An unverified organization is refused.

### Order and dependencies

1. **wk11** reviews.
2. **wk12-A** nearby discovery.
3. **wk12-B** emergency network, only after wk12-A is live and the notification volume is understood.

Each needs explicit owner approval and a local test run before it is applied.
