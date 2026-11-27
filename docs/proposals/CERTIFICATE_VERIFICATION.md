# Proposal: public certificate verification — REQUIRES APPROVAL

Status: proposal only, not applied.

## Today (verified in code)

- `/me/certificate/:id` renders a certificate from `my_participation()`.
- That function returns only the signed-in volunteer's own organization-verified participation records, so **only the volunteer can open it**.
- The certificate shows "Reference: <participation_id>". A third party, such as an employer or university, **cannot check** that reference: there is no public verification page.

## Goal

Anyone holding a certificate can confirm it is genuine. They should learn **only** what is printed on it, and nothing about the volunteer that the volunteer did not choose to share.

## Design (`wk09_certificate_verification`, additive)

```sql
-- Opaque, unguessable code; created on demand by the volunteer, revocable.
create table public.certificate_links (
  code             text primary key check (code ~ '^[A-Za-z0-9_-]{22}$'),   -- 128-bit random, base64url
  participation_id uuid not null unique references public.participation_records(id) on delete cascade,
  volunteer_id     uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz
);
alter table public.certificate_links enable row level security;
create policy cert_links_owner_select on public.certificate_links for select to authenticated
  using (volunteer_id = (select auth.uid()));
-- No direct insert/update grants: create/revoke only via RPCs below.

-- Volunteer creates (idempotent) or revokes a link for their own record.
--   public.create_certificate_link(p_participation_id uuid) returns text   -- checks ownership, reuses an active code
--   public.revoke_certificate_link(p_participation_id uuid) returns void

-- Public check: returns at most one row and only certificate fields.
create or replace function public.verify_certificate(p_code text)
returns table (volunteer_first_name text, org_name text, org_verified boolean,
               opportunity_title text, hours numeric, verified_on date)
language sql stable security definer set search_path = '' as $$
  select split_part(btrim(pr.full_name), ' ', 1), o.name, o.status = 'verified',
         op.title, r.hours, r.verified_at::date
  from public.certificate_links l
  join public.participation_records r on r.id = l.participation_id
  join public.profiles pr on pr.id = r.volunteer_id
  join public.organizations o on o.id = r.org_id
  left join public.shifts s on s.id = r.shift_id
  left join public.opportunities op on op.id = s.opportunity_id
  where l.code = p_code and l.revoked_at is null
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
```

(Column names are to be confirmed against `participation_records` before writing the migration.)

**UI:**
- The certificate gets a "Create verification link" button, then a QR code that encodes `/verify/<code>`. QR rendering needs a tiny dependency or an SVG, to be decided.
- `/verify/:code` shows "Genuine certificate" with the fields above, or "Not found or revoked".

## Privacy and security

- **Disclosure:** only the first name, the organization, the opportunity title, the hours and the verification date. No email, phone, user ID or other participation.
- **Codes:** 128-bit random and non-sequential, so they cannot be enumerated. Opaque codes are used, never participation UUIDs.
- **Revocation:** the volunteer can revoke a link at any time. Records deleted by the organization cascade.
- **Rate limiting:** rely on Supabase's API rate limits. Optionally log failed lookups.

## Test plan

1. Anonymous user with a valid code → exactly the 6 fields.
2. Revoked or unknown code → 0 rows.
3. Volunteer A cannot create a link for volunteer B's record.
4. Anonymous user cannot select from `certificate_links`.
5. The codes produced match the regex, and two calls return the same active code.

## Rollback

```sql
drop function if exists public.verify_certificate(text);
drop function if exists public.create_certificate_link(uuid);
drop function if exists public.revoke_certificate_link(uuid);
drop table if exists public.certificate_links;
```

## Production impact

Additive only. The Production frontend (`e616aad`) does not use it.
