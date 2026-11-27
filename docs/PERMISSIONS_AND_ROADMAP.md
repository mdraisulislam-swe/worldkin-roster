# Permissions, roadmap and future modules

Last updated 26 Nov 2026 (branch `feature/applications-platform`).

The database is the security boundary: RLS on all 17 public tables and SECURITY DEFINER RPCs with a fixed `search_path` (both checked live on 26 Nov). Route guards in the UI only hide navigation; they never grant access.

## 1. Permission matrix

| Capability | Platform admin | Org admin | Coordinator | Volunteer | Anonymous |
|---|---|---|---|---|---|
| Browse published, non-sensitive opportunities | ✓ | ✓ | ✓ | ✓ | ✓ |
| Own profile, private phone, avatar | own | own | own | own | — |
| Apply, withdraw, accept/decline own offers | ✓ | ✓ | ✓ | ✓ | — |
| Join shifts (capacity-safe, idempotent) | ✓ | ✓ | ✓ | ✓ | — |
| Create an organization (starts *pending*) | ✓ | ✓ | ✓ | ✓ | — |
| Edit organization profile, private details, documents | — | own org | — | — | — |
| Create/edit opportunities and shifts | — | own org | own org | — | — |
| See applicants (no phone/email/address), review, send offers | — | own org | own org | — | — |
| Private review notes | — | own org | own org | — | — |
| Record attendance / verify hours | — | own org | own org | — | — |
| Invite or remove team members, audit log | — | own org | — | — | — |
| Verify/reject/suspend organizations, moderate users | ✓ (not self or other admins) | — | — | — | — |
| Become platform admin through the API | ✗ | ✗ | ✗ | ✗ | ✗ |

"Own org" is checked server-side with `is_org_member` / `is_org_admin`. Users in several organizations pick one on `/orgs`, and each org dashboard offers "Switch organization". The organization always comes from the URL and is re-checked by the database. Live evidence: L1–L18, S1–S4 and apps L5–L7 in `docs/evidence/live_wk06/`.

## 2. Built from existing data (this branch)

- **Volunteer dashboard:**
  - Greeting.
  - Next steps (open offers, profile completion, no upcoming shifts, applications in review).
  - Applications summary.
  - Impact (verified hours, attended, organizations helped).
  - Upcoming agenda grouped by day, with calendar export (.ics).
  - Recent updates (latest notifications).
  - History.
- **Organization dashboard:**
  - Applicants to review (server counts).
  - Upcoming-shift capacity and waitlist.
  - Fill and no-show rates, verified hours.
  - Opportunities list.
  - Feedback.
  - Organization switcher.
- **Public:**
  - Homepage live platform counts (`platform_stats()`, verified records only).
  - Verified organizations directory and public profiles.

## 3. Postponed on purpose (each needs a reviewed migration or new storage)

| Feature | Why it is not in this pass | What it needs |
|---|---|---|
| Leaderboards (top volunteers/organizations, monthly/yearly) | Client code cannot aggregate other users' rows under RLS, and must not | A SECURITY DEFINER RPC over attended signups and verified hours only. It must exclude cancelled shifts, count each volunteer once, show first name only with an opt-in, and publish the ranking rule |
| Saved opportunities | No table yet | `saved_opportunities(user_id, opportunity_id)` with owner-only RLS |
| Organization cover image and event gallery | Only `avatars` (public) and `org-docs` (private) buckets exist | A public `org-media` bucket with folder-per-org write policies, type/size limits, and moderation |
| Reminders (offer expiry, upcoming shift) | No scheduler today | `pg_cron` job writing to `notifications`, idempotent per (user, shift, kind) |
| Organization activity feed | `audit_log` is admin-only by design | A filtered, org-scoped RPC, if wanted |

## 4. Future module: Emergency Volunteer Network (proposal only, not implemented)

**Flow:**
1. A verified organization raises a request with a type, an approximate area, a time window and the number of people needed.
2. The platform matches opted-in volunteers inside the radius.
3. Matched volunteers are notified, and each one accepts or declines.
4. Only accepted volunteers' contact details are released, and only to the requesting organization.

**Data:**
- **`emergency_profiles`** (owner-only RLS):
  - `user_id`, `opted_in`.
  - `approx_location geography(Point)`, rounded to about 1 km.
  - `radius_km`, `skills[]`.
  - Optional `blood_group` and private phone (reused).
- **`emergency_requests`:**
  - `org_id`, `kind`, `area geography`, `radius_km`, `needed`, `status`, `expires_at`, `created_by`.
- **`emergency_responses`:**
  - `request_id`, `user_id`, `status`, `responded_at`.
  - Unique per (request, user).

**Authorization:**
- Only org admins of *verified* organizations can create requests (RPC with `is_org_admin`).
- Matching runs in a SECURITY DEFINER RPC that returns counts, never identities.
- Identities are released per accepted response, to that organization only. Each release is audited.

**Geospatial:**
- PostGIS `ST_DWithin` on rounded points with a GiST index.
- Precise location is never stored or exposed.

**Delivery:**
- In-app notifications first. Email or push are optional later, respecting provider limits.

**Abuse prevention:**
- Rate limit per organization (for example 3 open requests, at most 1 per 10 minutes).
- Duplicate guard on (org, kind, area, time window).
- Platform-admin review for repeat or unusual requests.
- Everything written to the audit log.
- Volunteers can report false alarms.

**Privacy:**
- Opt-in, off by default.
- Opt-out deletes `emergency_profiles` immediately.
- Blood group and phone are hidden unless the volunteer accepts a specific request.
- There is no browsable volunteer directory.

## 5. Not promised

- No zero-downtime guarantee (see `docs/auth/RELIABILITY.md`).
- Attendance records cannot be corrected in the MVP.
- Sensitive-opportunity flags are not field-safety vetting.
