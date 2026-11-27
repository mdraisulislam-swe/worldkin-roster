# Worldkin Roster — Research and Design Decisions (applications platform)

Date: 25 Nov 2026 · Branch: `feature/applications-platform`

## Research basis

The three reference platforms were reviewed from their public product patterns (general familiarity with their public pages; they were not re-crawled in this session). No branding, layout, code or copy was taken.

| Reference | Pattern | Adopted as |
|---|---|---|
| VolunteerMatch | discovery first: keyword + cause + location + remote filters; "virtual" opportunities shown alongside local | Explore keeps keyword/cause/country/mode, adds city, skill and compensation filters |
| UN Volunteers (Unified Volunteering Platform) | rich volunteer profile (education, languages, availability); application → selection → **offer the candidate must accept within a deadline**; withdraw before acceptance | applications + offers with a 72-hour server-side expiry; profile fields for education, languages, availability, experience |
| Volunteer World | trust signals on organizations: verification, detailed program page, participant reviews | organization directory and profile pages with verification badge, published opportunities, and feedback only from verified participants |
| Hackathon judging (working demo, technical execution, security, testing, docs) | every visible button must work end to end; evidence over claims | no decorative controls; each feature has a database RPC, a UI path and a test |

## Decisions

1. **Two selection modes per opportunity** (`open` = existing instant join, `application` = apply → offer → accept). Keeps the proven A05 booking path and its live tests intact while adding hiring. An `application` opportunity refuses direct `join_shift`.
2. **Applications and signups stay separate.** Applying never reserves a seat. Only `accept_offer` creates a signup, and it calls the **same** booking core as `join_shift` (volunteer lock → shift lock → capacity/waitlist/conflict/idempotency). The booking rules exist only once.
3. **Offer expiry is computed on the server**: `expires_at = least(now() + 72 h, shift start)`. Acceptance checks `expires_at > now()` under a row lock; stale pending offers are marked expired whenever lists are read. No frontend timer is trusted.
4. **Lock order** everywhere: volunteer profile → offer/application → shift → signup. Org-side offer actions lock only the application/offer row, so no cycle with acceptance.
5. **Privacy by table split**: phone lives in `profile_private` (owner only); organization registration ID, representative and verification documents in `organization_private` (org members + platform admins). Applicant review uses an RPC that returns only non-contact profile fields. Org review notes live in `application_notes` (org members only).
6. **Complaints are private** (reporter + platform admins). **Feedback is public** but only for a verified participation record, one per record, moderated by platform admins; public output shows first name only.
7. **Notifications** are written only by server functions; users can only mark their own as read.
8. **Suspension** is a platform-admin RPC; suspended accounts cannot join, apply, accept offers or create organizations. Platform admins cannot be suspended through the API.
9. **Statistics** come from one anonymous-safe RPC (`platform_stats`) with counts only.
10. **Files**: avatars/logos in a public `avatars` bucket (owner folder), verification documents in a private `org-docs` bucket (org folder). Kept in a separate storage migration.
11. **Out of scope** (unchanged): payments, chat, maps, AI matching, external notification services.
