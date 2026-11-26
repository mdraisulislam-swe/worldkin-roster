# Product strategy — "One profile. Every opportunity. Verified experience."

Worldkin Roster connects four things that are usually separate:
- discovery;
- trustworthy organizations;
- a selection workflow;
- **experience that the organization, not the student, confirms**.

We do not claim any single part is globally unique. The defensible part is the combination: hours and participation can only be recorded by verified organization staff, through append-only records and server-side checks.

## 1. Capability map (verified against the schema and code, 26 Nov 2026)

| Area | Exists now | Missing / future |
|---|---|---|
| Discovery | Search, filters (cause, mode, country, city, skill, date, **compensation**), 5 sorts, pagination | Category beyond compensation (internship, part-time, fellowship, leadership) |
| Opportunity types | `compensation_type`: voluntary / stipend / paid (required, with details shown before applying) | `opportunity_kind` enum (needs a migration) |
| Selection | `selection_mode`: open join or application → review → 72 h offer → accept/decline | Interviews, multi-stage pipelines |
| Organizations | Verification (pending/verified/rejected/suspended), documents (private bucket), logo, public profile, feedback | Cover image, gallery, social links field |
| Experience | Organization-verified participation records, hours, certificates, printable **Experience passport** (this pass) | Responsibilities per role, verified skills, shareable public link |
| Impact | `platform_stats()` (verified orgs, completed events, verified hours), `my_impact`, `org_dashboard` | Leaderboards (need an aggregate RPC) |
| Trust and safety | Org verification gate, complaints to admins, sensitive-opportunity flag, audit log, RLS everywhere | Duplicate-listing detection |

## 2. Competitive position (practical, not "unique")

- **Job and internship boards:** list roles but do not verify outcomes.
- **Volunteer directories:** list roles but rarely run selection or record hours.
- **Credential tools:** issue badges, but are not connected to the place where the work was found.

Worldkin's practical edge:
- **(B) Verified experience passport** and **(E) one end-to-end workflow** together.
- Supported by **(C) organization verification**.
- Measured by **(D) verified-only impact numbers**.

Unified discovery **(A)** matters, but it is easy to copy. The verification chain is the hard part.

## 3. Honest labelling rules

- Paid, stipend-based and voluntary roles are always labelled. Compensation details are mandatory: a DB CHECK constraint enforces this and the UI shows it before applying.
- Voluntary work is never shown as employment or as a paid internship.
- The passport separates **organization-verified** facts (hours, sessions, dates) from **self-declared** skills and languages.
- No certificates or hours are created without an organization verification.

## 4. Recommendations

**MUST DO NOW (done in this pass, no database change)**
- Experience passport view on `/me/record`:
  - per-opportunity summary (organization, type, cause, first–last date, verified sessions, verified hours);
  - self-declared skills clearly labelled;
  - printable.
- Multi-organization switching, the day-grouped agenda and recent updates (earlier commits).

**SHOULD DO NEXT (small migrations, each reviewed and approved separately)**
1. `opportunity_kind` enum (volunteer, internship, part-time, fellowship, leadership) with a default of `volunteer`. Includes a filter chip and a badge.
2. `saved_opportunities` table with owner-only RLS.
3. Public leaderboard RPC:
   - counts attended, organization-verified hours only;
   - excludes cancelled shifts;
   - one row per volunteer;
   - shows first names only, after the volunteer opts in;
   - the method is shown on the page.
4. "Report this listing", reusing `complaints` with `opportunity_id` (already supported by the schema; this is UI only).

**FUTURE ROADMAP**
- Responsibilities and organization-endorsed skills per participation.
- Shareable public passport link (opt-in, revocable).
- Organization media bucket (cover and gallery).
- Reminders via `pg_cron`.
- The Emergency Volunteer Network (see `docs/PERMISSIONS_AND_ROADMAP.md` §4).

## 5. Risks

- The passport reads the same RLS-protected rows as before. One column was added to the query (`opportunities.compensation_type`, publicly readable).
- If an opportunity is later hidden, its title and type show as "no longer listed" or "Type not listed", and the hours stay counted.
- No new write paths. No new permissions.
