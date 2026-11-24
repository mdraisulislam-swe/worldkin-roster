-- =============================================================================
-- Worldkin Roster — Migration 02: authorization helpers, guard triggers, audit
-- -----------------------------------------------------------------------------
-- STATUS : DRAFT FOR OWNER REVIEW — NOT APPLIED
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
--
-- Conventions
--   * Every function pins search_path = '' and schema-qualifies all objects,
--     so a malicious object in another schema can never be picked up.
--   * Errors are raised as stable machine codes ("WK_...") that the frontend
--     maps to human messages; DETAIL carries extra context.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so RLS policies can call them
-- without recursive RLS evaluation on org_members / profiles)
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.platform_role = 'platform_admin'
  );
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.role = 'org_admin'
  );
$$;

-- True when the current user and p_user_id belong to at least one common org.
create or replace function public.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members me
    join public.org_members them on them.org_id = me.org_id
    where me.user_id = (select auth.uid())
      and them.user_id = p_user_id
  );
$$;

-- Public visibility rule for an opportunity, used by RLS and RPCs alike:
-- published + organization verified + (not sensitive, or caller signed in).
create or replace function public.is_opportunity_public(p_opportunity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.opportunities op
    join public.organizations o on o.id = op.org_id
    where op.id = p_opportunity_id
      and op.status = 'published'
      and o.status = 'verified'
      and (not op.is_sensitive or (select auth.uid()) is not null)
  );
$$;

-- True when the current statement comes through the Supabase Data API.
-- Primary, unforgeable signal: the Data API (PostgREST) always LOGS IN as
-- "authenticator"; session_user can only be changed by a superuser, so no API
-- request can shed it. Secondary signals: an API role is the current role, or
-- PostgREST request claims are present.
-- Trusted operator path = a direct database session as an owner role
-- (Supabase SQL Editor, Supabase MCP, psql with the database password):
-- no authenticator login, no API role, no request claims.
create or replace function public._is_api_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select session_user::text = 'authenticator'
      or current_user::text in ('anon', 'authenticated', 'service_role')
      or nullif(current_setting('request.jwt.claims', true), '') is not null
      or nullif(current_setting('request.jwt.claim.role', true), '') is not null;
$$;

-- -----------------------------------------------------------------------------
-- Generic updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.tg_set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
  for each row execute function public.tg_set_updated_at();
create trigger shifts_set_updated_at before update on public.shifts
  for each row execute function public.tg_set_updated_at();
create trigger signups_set_updated_at before update on public.signups
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Profile bootstrap: every new auth user gets a 'volunteer' profile.
-- The role is NEVER read from user-supplied metadata (escalation guard).
-- -----------------------------------------------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(btrim(left(new.raw_user_meta_data ->> 'full_name', 120)), ''), 'New volunteer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- -----------------------------------------------------------------------------
-- Profile guard (SECURITY INVOKER on purpose: current_user is the API role).
-- Second layer behind column privileges: API roles can never change
-- platform_role or id, even if a grant is misconfigured later.
-- -----------------------------------------------------------------------------
create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.platform_role is distinct from old.platform_role then
      raise exception 'WK_FORBIDDEN_ROLE_CHANGE'
        using errcode = '42501', detail = 'platform_role can only be changed by a platform operator';
    end if;
    if new.id is distinct from old.id then
      raise exception 'WK_IMMUTABLE_FIELD' using errcode = '42501', detail = 'profiles.id';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();

-- -----------------------------------------------------------------------------
-- Opportunity guard: lifecycle + "only verified organizations publish"
-- Allowed transitions: draft -> published, draft -> closed, published -> closed
-- -----------------------------------------------------------------------------
create or replace function public.tg_opportunities_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_status public.org_status;
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'WK_IMMUTABLE_FIELD' using errcode = '42501', detail = 'opportunities.org_id';
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'draft' and new.status in ('published', 'closed')
                or old.status = 'published' and new.status = 'closed') then
      raise exception 'WK_INVALID_TRANSITION'
        using errcode = 'P0001', detail = format('opportunity %s -> %s', old.status, new.status);
    end if;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select o.status into v_org_status from public.organizations o where o.id = new.org_id;
    if v_org_status is distinct from 'verified' then
      raise exception 'WK_ORG_NOT_VERIFIED'
        using errcode = 'P0001', detail = 'Only verified organizations can publish opportunities';
    end if;
    new.published_at := now();
  end if;

  return new;
end;
$$;

create trigger opportunities_guard before insert or update on public.opportunities
  for each row execute function public.tg_opportunities_guard();

-- -----------------------------------------------------------------------------
-- Shift guard: no shifts in the past (API callers only — operators may seed
-- historical demo data), no shifts on closed opportunities, and the time
-- window is frozen once anyone holds a place (keeps signups.slot consistent
-- with the shift, so overlap checks stay correct).
-- -----------------------------------------------------------------------------
create or replace function public.tg_shifts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp_status public.opportunity_status;
begin
  if tg_op = 'INSERT' then
    if new.starts_at <= now() and public._is_api_request() then
      raise exception 'WK_SHIFT_IN_PAST' using errcode = 'P0001';
    end if;
    select op.status into v_opp_status from public.opportunities op where op.id = new.opportunity_id;
    if v_opp_status = 'closed' then
      raise exception 'WK_OPPORTUNITY_CLOSED' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.org_id is distinct from old.org_id or new.opportunity_id is distinct from old.opportunity_id then
    raise exception 'WK_IMMUTABLE_FIELD' using errcode = '42501', detail = 'shifts.org_id/opportunity_id';
  end if;

  if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
    if exists (
      select 1 from public.signups g
      where g.shift_id = old.id and g.status <> 'cancelled'
    ) then
      raise exception 'WK_SHIFT_HAS_SIGNUPS'
        using errcode = 'P0001', detail = 'Shift time cannot change after volunteers have signed up';
    end if;
    if new.starts_at <= now() and public._is_api_request() then
      raise exception 'WK_SHIFT_IN_PAST' using errcode = 'P0001';
    end if;
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'WK_INVALID_TRANSITION' using errcode = 'P0001', detail = 'shift cancelled -> scheduled';
  end if;

  return new;
end;
$$;

create trigger shifts_guard before insert or update on public.shifts
  for each row execute function public.tg_shifts_guard();

-- -----------------------------------------------------------------------------
-- Append-only enforcement (participation_records, audit_logs)
-- Applies to every role that fires triggers, including SECURITY DEFINER RPCs.
-- -----------------------------------------------------------------------------
create or replace function public.tg_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WK_APPEND_ONLY'
    using errcode = '42501', detail = format('%s is append-only (%s blocked)', tg_table_name, tg_op);
end;
$$;

create trigger participation_records_append_only
  before update or delete on public.participation_records
  for each row execute function public.tg_block_mutation();
create trigger participation_records_no_truncate
  before truncate on public.participation_records
  for each statement execute function public.tg_block_mutation();

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.tg_block_mutation();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.tg_block_mutation();

-- -----------------------------------------------------------------------------
-- Audit trail: one generic AFTER trigger records who changed what.
-- UPDATEs store only the changed fields ({"field": {"from": .., "to": ..}}).
-- -----------------------------------------------------------------------------
create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row     jsonb;
  v_details jsonb;
begin
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value)), '{}'::jsonb)
      into v_details
      from jsonb_each(v_new) as n
     where n.value is distinct from (v_old -> n.key)
       and n.key not in ('updated_at', 'search_vector');
    if v_details = '{}'::jsonb then
      return null;  -- nothing meaningful changed
    end if;
  else
    v_details := v_row - 'search_vector';
  end if;

  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    coalesce(
      (v_row ->> 'org_id')::uuid,
      case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end
    ),
    lower(tg_op),
    tg_table_name,
    case when tg_table_name = 'org_members' then (v_row ->> 'user_id')::uuid else (v_row ->> 'id')::uuid end,
    v_details
  );
  return null;
end;
$$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.tg_audit();
create trigger org_members_audit after insert or update or delete on public.org_members
  for each row execute function public.tg_audit();
create trigger org_invites_audit after insert or update or delete on public.org_invites
  for each row execute function public.tg_audit();
create trigger opportunities_audit after insert or update or delete on public.opportunities
  for each row execute function public.tg_audit();
create trigger shifts_audit after insert or update or delete on public.shifts
  for each row execute function public.tg_audit();
create trigger signups_audit after insert or update or delete on public.signups
  for each row execute function public.tg_audit();
create trigger participation_records_audit after insert on public.participation_records
  for each row execute function public.tg_audit();
-- Profiles: only role changes are security-relevant (avoid logging personal edits).
create trigger profiles_role_audit after update of platform_role on public.profiles
  for each row execute function public.tg_audit();
