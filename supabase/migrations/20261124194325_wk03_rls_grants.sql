-- =============================================================================
-- Worldkin Roster — Migration 03: Row Level Security + least-privilege grants
-- -----------------------------------------------------------------------------
-- STATUS : DRAFT FOR OWNER REVIEW — NOT APPLIED
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
--
-- Two independent layers (defense in depth):
--   1. GRANTs decide WHICH COLUMNS an API role may read/write at all.
--   2. RLS policies decide WHICH ROWS it may see/change.
-- Tables without an INSERT/UPDATE/DELETE grant can only be written through
-- SECURITY DEFINER RPC functions (migration 04), which enforce business rules.
-- =============================================================================

alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.org_members           enable row level security;
alter table public.org_invites           enable row level security;
alter table public.opportunities         enable row level security;
alter table public.shifts                enable row level security;
alter table public.signups               enable row level security;
alter table public.participation_records enable row level security;
alter table public.audit_logs            enable row level security;

-- Start from zero: Supabase grants broad table privileges to API roles by default.
revoke all on table
  public.profiles, public.organizations, public.org_members, public.org_invites, public.opportunities,
  public.shifts, public.signups, public.participation_records, public.audit_logs
from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Column-level privileges
-- -----------------------------------------------------------------------------
-- profiles: read (rows limited by RLS); edit own safe fields only — never platform_role.
grant select on public.profiles to authenticated;
grant update (full_name, country_code, city, bio, skills) on public.profiles to authenticated;

-- organizations: public directory of verified orgs; org admins edit descriptive fields only.
-- (status / reviewed_by / reviewed_at are writable only via review_organization RPC)
grant select on public.organizations to anon, authenticated;
grant update (name, description, website, country_code, cause) on public.organizations to authenticated;

-- org_members / org_invites: read only; membership changes go through RPCs.
grant select on public.org_members to authenticated;
grant select on public.org_invites to authenticated;

-- opportunities: staff create/edit; created_by / published_at are never client-supplied.
grant select on public.opportunities to anon, authenticated;
grant insert (org_id, title, description, cause, mode, country_code, city, is_sensitive, skills_wanted,
              requirements, requires_skill_match, status)
  on public.opportunities to authenticated;
grant update (title, description, cause, mode, country_code, city, is_sensitive, skills_wanted,
              requirements, requires_skill_match, status)
  on public.opportunities to authenticated;

-- shifts: staff create; capacity and status change ONLY via RPC (waitlist promotion, cascade cancel).
grant select on public.shifts to anon, authenticated;
grant insert (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit)
  on public.shifts to authenticated;
grant update (title, starts_at, ends_at, waitlist_limit) on public.shifts to authenticated;

-- signups / participation / audit: read only for API roles.
grant select on public.signups to authenticated;
grant select on public.participation_records to authenticated;
grant select on public.audit_logs to authenticated;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.shares_org_with(id)
    or public.is_platform_admin()
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to anon, authenticated
  using (
    status = 'verified'
    or public.is_org_member(id)
    or public.is_platform_admin()
  );

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- -----------------------------------------------------------------------------
-- org_members
-- -----------------------------------------------------------------------------
create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- org_invites (org admins of that org and platform admins only; invitees use
-- the my_org_invites RPC, which matches their confirmed email)
-- -----------------------------------------------------------------------------
create policy org_invites_select on public.org_invites
  for select to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- opportunities
-- -----------------------------------------------------------------------------
create policy opportunities_select on public.opportunities
  for select to anon, authenticated
  using (
    public.is_opportunity_public(id)
    or public.is_org_member(org_id)
    or public.is_platform_admin()
  );

create policy opportunities_insert_staff on public.opportunities
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy opportunities_update_staff on public.opportunities
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- -----------------------------------------------------------------------------
-- shifts
-- -----------------------------------------------------------------------------
create policy shifts_select on public.shifts
  for select to anon, authenticated
  using (
    public.is_opportunity_public(opportunity_id)
    or public.is_org_member(org_id)
    or public.is_platform_admin()
  );

create policy shifts_insert_staff on public.shifts
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy shifts_update_staff on public.shifts
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- -----------------------------------------------------------------------------
-- signups (read: own rows, staff of that org, platform admin)
-- -----------------------------------------------------------------------------
create policy signups_select on public.signups
  for select to authenticated
  using (
    volunteer_id = (select auth.uid())
    or public.is_org_member(org_id)
    or public.is_platform_admin()
  );

-- -----------------------------------------------------------------------------
-- participation_records
-- -----------------------------------------------------------------------------
create policy participation_select on public.participation_records
  for select to authenticated
  using (
    volunteer_id = (select auth.uid())
    or public.is_org_member(org_id)
    or public.is_platform_admin()
  );

-- -----------------------------------------------------------------------------
-- audit_logs (platform admin: all; org admin: own organization only)
-- -----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or (org_id is not null and public.is_org_admin(org_id))
  );
