-- =============================================================================
-- ROLLBACK of migration wk06 (applications platform) — DO NOT RUN unless the
-- owner approves a rollback. Run as ONE transaction (the whole file at once).
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
-- Effect : removes every object wk06 added and restores the wk04/wk05 versions
-- of search_opportunities, create_organization and join_shift.
-- DATA LOSS: all rows in the 8 new tables and all values in the 18 new columns
-- are deleted. Audit rows already written stay (audit_logs is append-only).
-- Afterwards delete the wk06 row from supabase_migrations.schema_migrations.
-- =============================================================================

-- 1. Triggers that wk06 added to pre-existing tables
drop trigger if exists opportunities_selection_guard  on public.opportunities;
drop trigger if exists organizations_notify_status    on public.organizations;
drop trigger if exists signups_notify_change          on public.signups;
drop trigger if exists participation_notify           on public.participation_records;
drop trigger if exists shifts_revoke_offers_on_cancel on public.shifts;

-- 2. New and extended RPCs
drop function if exists public.apply_to_opportunity(uuid, text);
drop function if exists public.withdraw_application(uuid);
drop function if exists public.review_application(uuid, text, text, text);
drop function if exists public.send_offer(uuid, uuid, text);
drop function if exists public.revoke_offer(uuid, text);
drop function if exists public.accept_offer(uuid, uuid);
drop function if exists public.decline_offer(uuid);
drop function if exists public.my_applications();
drop function if exists public.org_applications(uuid, uuid, public.application_status, integer, integer);
drop function if exists public.my_participation();
drop function if exists public.submit_feedback(uuid, integer, text);
drop function if exists public.org_feedback(uuid, integer, integer);
drop function if exists public.moderate_feedback(uuid, public.feedback_status, text);
drop function if exists public.submit_complaint(text, text, uuid, uuid);
drop function if exists public.respond_complaint(uuid, public.complaint_status, text);
drop function if exists public.admin_set_suspension(uuid, boolean, text);
drop function if exists public.admin_users(text, integer, integer);
drop function if exists public.admin_moderate_opportunity(uuid, text);
drop function if exists public.admin_overview();
drop function if exists public.platform_stats();
drop function if exists public.list_organizations(text, text, public.cause_category, public.org_type, integer, integer);
drop function if exists public.search_opportunities(text, public.cause_category, text, public.opportunity_mode, timestamptz, boolean, text, integer, integer, public.compensation_type, text, text, uuid);
drop function if exists public.create_organization(text, text, public.cause_category, text, text, text, public.org_type, text, text, text, text, text, text, text);

-- 3. Restore the pre-wk06 functions (verbatim from wk04 / wk05)
create or replace function public.search_opportunities(
  p_query        text default null,
  p_cause        public.cause_category default null,
  p_country_code text default null,
  p_mode         public.opportunity_mode default null,
  p_starts_after timestamptz default null,
  p_only_open    boolean default false,
  p_sort         text default 'soonest',      -- soonest | newest | most_open | relevance
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (
  id              uuid,
  org_id          uuid,
  org_name        text,
  title           text,
  cause           public.cause_category,
  mode            public.opportunity_mode,
  country_code    text,
  city            text,
  is_sensitive    boolean,
  published_at    timestamptz,
  next_shift_at   timestamptz,
  upcoming_shifts bigint,
  open_spots      bigint,
  total_count     bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select op.id, op.org_id, o.name as org_name, op.title, op.cause, op.mode, op.country_code,
           op.city, op.is_sensitive, op.published_at, op.search_vector
    from public.opportunities op
    join public.organizations o on o.id = op.org_id
    where op.status = 'published'
      and o.status = 'verified'
      and (not op.is_sensitive or (select auth.uid()) is not null)
      and (p_cause is null or op.cause = p_cause)
      and (p_country_code is null or op.country_code = upper(btrim(p_country_code)))
      and (p_mode is null or op.mode = p_mode)
      and (nullif(btrim(p_query), '') is null
           or op.search_vector @@ websearch_to_tsquery('simple', p_query))
  ),
  stats as (
    select s.opportunity_id,
           min(s.starts_at)                                              as next_shift_at,
           count(*)                                                      as upcoming_shifts,
           sum(greatest(s.capacity - coalesce(c.confirmed, 0), 0))::bigint as open_spots
    from public.shifts s
    left join lateral (
      select count(*) as confirmed
      from public.signups g
      where g.shift_id = s.id and g.status = 'confirmed'
    ) c on true
    where s.status = 'scheduled'
      and s.starts_at > now()
      and (p_starts_after is null or s.starts_at >= p_starts_after)
      and s.opportunity_id in (select b.id from base b)
    group by s.opportunity_id
  )
  select b.id, b.org_id, b.org_name, b.title, b.cause, b.mode, b.country_code, b.city,
         b.is_sensitive, b.published_at, st.next_shift_at,
         coalesce(st.upcoming_shifts, 0), coalesce(st.open_spots, 0),
         count(*) over ()
  from base b
  left join stats st on st.opportunity_id = b.id
  where (not coalesce(p_only_open, false) or coalesce(st.open_spots, 0) > 0)
    and (p_starts_after is null or st.next_shift_at is not null)
  order by
    case when p_sort = 'newest' then b.published_at end desc nulls last,
    case when p_sort = 'most_open' then coalesce(st.open_spots, 0) end desc nulls last,
    case when p_sort = 'relevance' and nullif(btrim(p_query), '') is not null
         then ts_rank(b.search_vector, websearch_to_tsquery('simple', p_query)) end desc nulls last,
    st.next_shift_at asc nulls last,
    b.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.create_organization(
  p_name         text,
  p_slug         text,
  p_cause        public.cause_category,
  p_country_code text,
  p_description  text default null,
  p_website      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if (select count(*) from public.organizations o
      where o.created_by = v_uid and o.status = 'pending') >= 3 then
    raise exception 'WK_TOO_MANY_PENDING_ORGS' using errcode = 'P0001';
  end if;

  begin
    insert into public.organizations (name, slug, cause, country_code, description, website, created_by)
    values (btrim(p_name), lower(btrim(p_slug)), p_cause, upper(btrim(p_country_code)),
            nullif(btrim(p_description), ''), nullif(btrim(p_website), ''), v_uid)
    returning id into v_org_id;
  exception
    when unique_violation then
      raise exception 'WK_SLUG_TAKEN' using errcode = '23505';
    when check_violation or not_null_violation then
      raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = sqlerrm;
  end;

  insert into public.org_members (org_id, user_id, role, added_by)
  values (v_org_id, v_uid, 'org_admin', v_uid);

  return v_org_id;
end;
$$;

-- join_shift keeps its signature, so CREATE OR REPLACE keeps its EXECUTE grants.
create or replace function public.join_shift(p_shift_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_shift      public.shifts%rowtype;
  v_opp_status text;
  v_org_status text;
  v_existing   public.signups%rowtype;
  v_signup     public.signups%rowtype;
  v_conflict   uuid;
  v_confirmed  integer;
  v_waitlisted integer;
  v_status     public.signup_status;
  v_slot       tstzrange;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_shift_id is null or p_idempotency_key is null then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = 'shift id and idempotency key are required';
  end if;

  -- (0) Serialize this volunteer's own joins. Without it, two parallel joins by
  --     the same volunteer for two OVERLAPPING shifts lock different shift rows,
  --     both insert, and then wait on each other inside the exclusion constraint
  --     (live test C3 observed 40P01 deadlock_detected). FOR NO KEY UPDATE does
  --     not block FK checks (FOR KEY SHARE) from other transactions.
  --     Lock order everywhere: volunteer profile -> shift -> signup.
  perform 1 from public.profiles p where p.id = v_uid for no key update;

  -- (1) Serialize every seat decision for this shift.
  select * into v_shift from public.shifts s where s.id = p_shift_id for update;
  if not found then
    raise exception 'WK_SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- (2) Idempotent replay. Checked after the lock, so a concurrent retry of the
  --     same request sees the first attempt's committed row.
  select * into v_existing
  from public.signups g
  where g.volunteer_id = v_uid and g.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.shift_id <> p_shift_id then
      raise exception 'WK_IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return public._signup_result(v_existing, true);
  end if;

  -- (3) Eligibility rules.
  select op.status::text, o.status::text
    into v_opp_status, v_org_status
  from public.opportunities op
  join public.organizations o on o.id = op.org_id
  where op.id = v_shift.opportunity_id;

  if v_org_status <> 'verified' or v_opp_status <> 'published' then
    raise exception 'WK_SHIFT_NOT_OPEN' using errcode = 'P0001',
      detail = format('organization=%s opportunity=%s', v_org_status, v_opp_status);
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'WK_SHIFT_CANCELLED' using errcode = 'P0001';
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'WK_SHIFT_STARTED' using errcode = 'P0001';
  end if;

  -- (3b) Skill eligibility: when required, the volunteer must list at least one
  --      wanted skill (case-insensitive match).
  if exists (
    select 1 from public.opportunities op
    where op.id = v_shift.opportunity_id
      and op.requires_skill_match
      and not exists (
        select 1
        from public.profiles p
        cross join lateral unnest(p.skills) as have(skill)
        cross join lateral unnest(op.skills_wanted) as want(skill)
        where p.id = v_uid
          and lower(btrim(have.skill)) = lower(btrim(want.skill))
      )
  ) then
    raise exception 'WK_NOT_ELIGIBLE' using errcode = 'P0001',
      detail = 'This opportunity requires at least one of its listed skills';
  end if;

  -- (4) Duplicate action (e.g. second tab, different idempotency key).
  select * into v_existing
  from public.signups g
  where g.shift_id = p_shift_id and g.volunteer_id = v_uid and g.status <> 'cancelled';
  if found then
    raise exception 'WK_ALREADY_SIGNED_UP' using errcode = '23505', detail = v_existing.status::text;
  end if;

  -- (5) Overlapping commitments (friendly pre-check; exclusion constraint is the guarantee).
  v_slot := tstzrange(v_shift.starts_at, v_shift.ends_at, '[)');
  select g.shift_id into v_conflict
  from public.signups g
  where g.volunteer_id = v_uid
    and g.status in ('confirmed', 'waitlisted', 'attended')
    and g.slot && v_slot
  limit 1;
  if found then
    raise exception 'WK_SCHEDULE_CONFLICT' using errcode = '23P01', detail = v_conflict::text;
  end if;

  -- (6) Capacity decision, made while holding the shift lock.
  select count(*) filter (where g.status = 'confirmed'),
         count(*) filter (where g.status = 'waitlisted')
    into v_confirmed, v_waitlisted
  from public.signups g
  where g.shift_id = p_shift_id;

  if v_confirmed < v_shift.capacity then
    v_status := 'confirmed';
  elsif v_waitlisted < v_shift.waitlist_limit then
    v_status := 'waitlisted';
  else
    raise exception 'WK_SHIFT_FULL' using errcode = 'P0001',
      detail = format('capacity=%s waitlist_limit=%s', v_shift.capacity, v_shift.waitlist_limit);
  end if;

  -- (7) Insert; constraint violations from races on OTHER shifts are mapped to codes.
  begin
    insert into public.signups (shift_id, org_id, volunteer_id, status, slot, idempotency_key)
    values (p_shift_id, v_shift.org_id, v_uid, v_status, v_slot, p_idempotency_key)
    returning * into v_signup;
  exception
    when exclusion_violation then
      raise exception 'WK_SCHEDULE_CONFLICT' using errcode = '23P01';
    when unique_violation then
      raise exception 'WK_DUPLICATE_REQUEST' using errcode = '23505';
  end;

  return public._signup_result(v_signup, false);
end;
$$;

-- New functions get EXECUTE for anon by default on Supabase: reset to the wk04 grants.
revoke execute on function public.search_opportunities(text, public.cause_category, text, public.opportunity_mode, timestamptz, boolean, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_opportunities(text, public.cause_category, text, public.opportunity_mode, timestamptz, boolean, text, integer, integer) to anon, authenticated;
revoke execute on function public.create_organization(text, text, public.cause_category, text, text, text) from public, anon, authenticated;
grant execute on function public.create_organization(text, text, public.cause_category, text, text, text) to authenticated;
revoke execute on function public.join_shift(uuid, uuid) from public, anon;
grant execute on function public.join_shift(uuid, uuid) to authenticated;

-- 4. New tables (dependents first)
drop table if exists public.notifications;
drop table if exists public.feedback;
drop table if exists public.complaints;
drop table if exists public.offers;
drop table if exists public.application_notes;
drop table if exists public.applications;
drop table if exists public.organization_private;
drop table if exists public.profile_private;

-- 5. Internal helpers and trigger functions
drop function if exists public._join_shift_core(uuid, uuid, uuid, boolean);
drop function if exists public._expire_offers();
drop function if exists public._assert_active(uuid);
drop function if exists public._notify(uuid, text, text, text, text);
drop function if exists public._notify_org_admins(uuid, text, text, text, text);
drop function if exists public.docs_in_org_folder(uuid, text[]);
drop function if exists public.tg_offers_consistency();
drop function if exists public.tg_opportunities_selection_guard();
drop function if exists public.tg_notify_org_status();
drop function if exists public.tg_notify_signup_change();
drop function if exists public.tg_notify_participation();
drop function if exists public.tg_revoke_offers_on_shift_cancel();

-- 6. New columns on pre-existing tables (their CHECKs, index and grants go with them)
alter table public.opportunities
  drop constraint if exists opportunities_compensation_details_required,
  drop constraint if exists opportunities_deadline_needs_application,
  drop column if exists compensation_type,
  drop column if exists compensation_details,
  drop column if exists application_deadline,
  drop column if exists selection_mode,
  drop column if exists moderation_reason,
  drop column if exists moderated_at;
alter table public.organizations
  drop column if exists org_type,
  drop column if exists city,
  drop column if exists phone,
  drop column if exists official_email,
  drop column if exists logo_url;
alter table public.profiles
  drop column if exists education,
  drop column if exists interests,
  drop column if exists languages,
  drop column if exists availability,
  drop column if exists experience,
  drop column if exists avatar_url,
  drop column if exists suspended_at;

-- 7. Types
drop type if exists public.compensation_type;
drop type if exists public.selection_mode;
drop type if exists public.application_status;
drop type if exists public.offer_status;
drop type if exists public.complaint_status;
drop type if exists public.feedback_status;
drop type if exists public.org_type;
