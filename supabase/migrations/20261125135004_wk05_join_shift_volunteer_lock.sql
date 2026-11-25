-- =============================================================================
-- Worldkin Roster — Migration 05: join_shift deadlock fix (A05)
-- -----------------------------------------------------------------------------
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
-- Finding: live A05 run 1 (25 Nov 2026) — concurrent joins by ONE volunteer for
-- two overlapping shifts returned 40P01 (deadlock) instead of
-- WK_SCHEDULE_CONFLICT. Data integrity held (exactly one join succeeded).
-- Change : join_shift now takes a per-volunteer row lock first. Signature,
-- grants, return shape and every other rule are unchanged
-- (CREATE OR REPLACE keeps the existing EXECUTE grants).
-- =============================================================================
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
