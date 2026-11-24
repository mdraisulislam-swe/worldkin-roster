-- =============================================================================
-- Worldkin Roster — Migration 04: RPC functions (business logic + transactions)
-- -----------------------------------------------------------------------------
-- STATUS : DRAFT FOR OWNER REVIEW — NOT APPLIED
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
--
-- Every RPC runs inside ONE database transaction (PostgREST wraps each call).
-- Any raised error rolls back every change made by that call — no partial state.
--
-- Concurrency model (A05)
--   * Seat decisions for a shift are serialized with SELECT ... FOR UPDATE on
--     the shift row. Under READ COMMITTED each later statement takes a fresh
--     snapshot, so counts read AFTER acquiring the lock include every
--     previously committed signup.
--   * Lock order is always shift -> signup, which prevents deadlocks.
--   * Constraints are the final safety net: signups_one_active_per_shift,
--     signups_idempotency_key, signups_no_overlap (exclusion constraint).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal: result payload for a signup (not callable by clients)
-- -----------------------------------------------------------------------------
create or replace function public._signup_result(p_signup public.signups, p_replayed boolean)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signup_id', p_signup.id,
    'shift_id', p_signup.shift_id,
    'status', p_signup.status,
    'replayed', p_replayed,
    'waitlist_position', case
      when p_signup.status = 'waitlisted' then (
        select count(*)
        from public.signups w
        where w.shift_id = p_signup.shift_id
          and w.status = 'waitlisted'
          and w.queue_seq <= p_signup.queue_seq
      )
    end
  );
$$;

-- -----------------------------------------------------------------------------
-- Internal: fill free seats from the waitlist in strict FIFO order.
-- PRECONDITION: caller already holds the FOR UPDATE lock on the shift row.
-- -----------------------------------------------------------------------------
create or replace function public._promote_waitlist(p_shift_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity  integer;
  v_confirmed integer;
  v_next      uuid;
  v_promoted  uuid[] := '{}';
begin
  select s.capacity into v_capacity from public.shifts s where s.id = p_shift_id;

  select count(*) into v_confirmed
  from public.signups g
  where g.shift_id = p_shift_id and g.status = 'confirmed';

  while v_confirmed < v_capacity loop
    select g.id into v_next
    from public.signups g
    where g.shift_id = p_shift_id and g.status = 'waitlisted'
    order by g.queue_seq
    limit 1
    for update;

    exit when not found;

    update public.signups
       set status = 'confirmed', promoted_at = now()
     where id = v_next;

    v_promoted  := v_promoted || v_next;
    v_confirmed := v_confirmed + 1;
  end loop;

  return v_promoted;
end;
$$;

-- -----------------------------------------------------------------------------
-- join_shift: atomic, idempotent signup (confirmed if a seat is free,
-- otherwise waitlisted, otherwise rejected)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- cancel_signup: volunteer cancels own place, or staff removes a volunteer
-- (reason required). Freed confirmed seat is given to the waitlist head.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_signup(p_signup_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_shift_id uuid;
  v_shift    public.shifts%rowtype;
  v_signup   public.signups%rowtype;
  v_is_staff boolean;
  v_promoted uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select g.shift_id into v_shift_id from public.signups g where g.id = p_signup_id;
  if not found then
    raise exception 'WK_SIGNUP_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Lock order: shift, then signup.
  select * into v_shift from public.shifts s where s.id = v_shift_id for update;
  select * into v_signup from public.signups g where g.id = p_signup_id for update;

  v_is_staff := exists (
    select 1 from public.org_members m where m.org_id = v_signup.org_id and m.user_id = v_uid
  );
  if v_signup.volunteer_id <> v_uid and not v_is_staff then
    -- Same error as "not found": do not reveal other people's signups.
    raise exception 'WK_SIGNUP_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_signup.status = 'cancelled' then
    return jsonb_build_object('signup_id', v_signup.id, 'status', 'cancelled',
                              'replayed', true, 'promoted_signup_ids', '[]'::jsonb);
  end if;
  if v_signup.status not in ('confirmed', 'waitlisted') then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001', detail = v_signup.status::text;
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'WK_SHIFT_STARTED' using errcode = 'P0001';
  end if;
  if v_signup.volunteer_id <> v_uid and nullif(btrim(p_reason), '') is null then
    raise exception 'WK_REASON_REQUIRED' using errcode = '22023';
  end if;

  update public.signups
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancel_reason = left(nullif(btrim(p_reason), ''), 500)
   where id = p_signup_id;

  if v_signup.status = 'confirmed' then
    v_promoted := public._promote_waitlist(v_shift.id);
  end if;

  return jsonb_build_object('signup_id', v_signup.id, 'status', 'cancelled',
                            'replayed', false, 'promoted_signup_ids', to_jsonb(v_promoted));
end;
$$;

-- -----------------------------------------------------------------------------
-- update_shift_capacity: staff only; cannot drop below confirmed count;
-- increasing capacity promotes from the waitlist in the same transaction.
-- -----------------------------------------------------------------------------
create or replace function public.update_shift_capacity(p_shift_id uuid, p_capacity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_shift     public.shifts%rowtype;
  v_confirmed integer;
  v_promoted  uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_capacity is null or p_capacity not between 1 and 500 then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = 'capacity must be 1..500';
  end if;

  select * into v_shift from public.shifts s where s.id = p_shift_id for update;
  if not found or not exists (
    select 1 from public.org_members m where m.org_id = v_shift.org_id and m.user_id = v_uid
  ) then
    raise exception 'WK_SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'WK_SHIFT_CANCELLED' using errcode = 'P0001';
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'WK_SHIFT_STARTED' using errcode = 'P0001';
  end if;

  select count(*) into v_confirmed
  from public.signups g
  where g.shift_id = p_shift_id and g.status = 'confirmed';

  if p_capacity < v_confirmed then
    raise exception 'WK_CAPACITY_BELOW_CONFIRMED' using errcode = 'P0001',
      detail = format('confirmed=%s requested=%s', v_confirmed, p_capacity);
  end if;

  update public.shifts set capacity = p_capacity where id = p_shift_id;

  if p_capacity > v_shift.capacity then
    v_promoted := public._promote_waitlist(p_shift_id);
  end if;

  return jsonb_build_object('shift_id', p_shift_id, 'capacity', p_capacity,
                            'confirmed', v_confirmed + coalesce(array_length(v_promoted, 1), 0),
                            'promoted_signup_ids', to_jsonb(v_promoted));
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_shift: staff only; cancels the shift and every active place atomically.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_shift(p_shift_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_shift     public.shifts%rowtype;
  v_cancelled integer;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'WK_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_shift from public.shifts s where s.id = p_shift_id for update;
  if not found or not exists (
    select 1 from public.org_members m where m.org_id = v_shift.org_id and m.user_id = v_uid
  ) then
    raise exception 'WK_SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.status = 'cancelled' then
    return jsonb_build_object('shift_id', p_shift_id, 'status', 'cancelled', 'replayed', true);
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'WK_SHIFT_STARTED' using errcode = 'P0001';
  end if;

  update public.shifts
     set status = 'cancelled', cancelled_reason = left(btrim(p_reason), 500)
   where id = p_shift_id;

  update public.signups
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
         cancel_reason = left('Shift cancelled: ' || btrim(p_reason), 500)
   where shift_id = p_shift_id and status in ('confirmed', 'waitlisted');
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object('shift_id', p_shift_id, 'status', 'cancelled',
                            'replayed', false, 'cancelled_signups', v_cancelled);
end;
$$;

-- -----------------------------------------------------------------------------
-- record_attendance: staff of the organization marks attended / no-show.
-- Rules: not your own signup; shift has started; within 7 days after end;
-- only once; hours > 0 and <= shift duration. Creates an immutable record.
-- -----------------------------------------------------------------------------
create or replace function public.record_attendance(
  p_signup_id uuid,
  p_attended  boolean,
  p_hours     numeric default null,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_shift_id  uuid;
  v_shift     public.shifts%rowtype;
  v_signup    public.signups%rowtype;
  v_max_hours numeric;
  v_hours     numeric;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_attended is null then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = 'attended flag is required';
  end if;

  select g.shift_id into v_shift_id from public.signups g where g.id = p_signup_id;
  if not found then
    raise exception 'WK_SIGNUP_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_shift from public.shifts s where s.id = v_shift_id for update;
  select * into v_signup from public.signups g where g.id = p_signup_id for update;

  if not exists (
    select 1 from public.org_members m where m.org_id = v_signup.org_id and m.user_id = v_uid
  ) then
    raise exception 'WK_SIGNUP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_signup.volunteer_id = v_uid then
    raise exception 'WK_SELF_VERIFICATION' using errcode = '42501';
  end if;
  if v_signup.status in ('attended', 'no_show') then
    raise exception 'WK_ALREADY_RECORDED' using errcode = '23505', detail = v_signup.status::text;
  end if;
  if v_signup.status <> 'confirmed' then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001', detail = v_signup.status::text;
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'WK_SHIFT_CANCELLED' using errcode = 'P0001';
  end if;
  if now() < v_shift.starts_at then
    raise exception 'WK_SHIFT_NOT_STARTED' using errcode = 'P0001';
  end if;
  if now() > v_shift.ends_at + interval '7 days' then
    raise exception 'WK_ATTENDANCE_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  if p_attended then
    v_max_hours := round(extract(epoch from (v_shift.ends_at - v_shift.starts_at)) / 3600.0, 2);
    v_hours := coalesce(p_hours, v_max_hours);
    if v_hours <= 0 or v_hours > v_max_hours then
      raise exception 'WK_INVALID_HOURS' using errcode = '22023',
        detail = format('hours must be > 0 and <= %s', v_max_hours);
    end if;
  end if;

  update public.signups
     set status = case when p_attended then 'attended'::public.signup_status
                       else 'no_show'::public.signup_status end,
         attendance_recorded_at = now(),
         attendance_recorded_by = v_uid
   where id = p_signup_id;

  if p_attended then
    insert into public.participation_records (signup_id, shift_id, org_id, volunteer_id, hours, verified_by, note)
    values (p_signup_id, v_shift.id, v_signup.org_id, v_signup.volunteer_id, v_hours, v_uid,
            left(nullif(btrim(p_note), ''), 500));
  end if;

  return jsonb_build_object('signup_id', p_signup_id,
                            'status', case when p_attended then 'attended' else 'no_show' end,
                            'hours', case when p_attended then v_hours end);
end;
$$;

-- -----------------------------------------------------------------------------
-- create_organization: creator becomes org_admin in the same transaction.
-- Anti-spam rule: at most 3 pending organizations per user.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- review_organization: platform admin decision with an explicit state machine.
--   pending -> verified | rejected ; verified -> suspended ; suspended -> verified
-- A platform admin may not review an organization they belong to.
-- -----------------------------------------------------------------------------
create or replace function public.review_organization(
  p_org_id   uuid,
  p_decision public.org_status,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_org from public.organizations o where o.id = p_org_id for update;
  if not found then
    raise exception 'WK_ORG_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.org_members m where m.org_id = p_org_id and m.user_id = v_uid) then
    raise exception 'WK_CONFLICT_OF_INTEREST' using errcode = '42501';
  end if;
  if not (v_org.status = 'pending'   and p_decision in ('verified', 'rejected')
       or v_org.status = 'verified'  and p_decision = 'suspended'
       or v_org.status = 'suspended' and p_decision = 'verified') then
    raise exception 'WK_INVALID_TRANSITION' using errcode = 'P0001',
      detail = format('organization %s -> %s', v_org.status, p_decision);
  end if;
  if p_decision in ('rejected', 'suspended') and nullif(btrim(p_reason), '') is null then
    raise exception 'WK_REASON_REQUIRED' using errcode = '22023';
  end if;

  update public.organizations
     set status = p_decision,
         status_reason = left(nullif(btrim(p_reason), ''), 500),
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_org_id;

  return jsonb_build_object('org_id', p_org_id, 'from', v_org.status, 'to', p_decision);
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff onboarding by consent-based email invite (no user-enumeration oracle):
--   invite_org_member  : org admin of a VERIFIED org records an invite. It never
--                        reads auth.users or org_members, so the response is the
--                        same whether or not the email is registered.
--   my_org_invites     : the signed-in user sees open invites for their own
--                        CONFIRMED email.
--   accept_org_invite  : that user accepts -> becomes a member.
--   revoke_org_invite  : org admin withdraws an open invite.
-- remove_org_member    : org admins manage their own team.
-- -----------------------------------------------------------------------------
create or replace function public.invite_org_member(p_org_id uuid, p_email text, p_role public.org_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(btrim(p_email));
  v_invite public.org_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org_id and o.status = 'verified') then
    raise exception 'WK_ORG_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if p_role is null or v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = 'a valid email and role are required';
  end if;

  -- Serialize invites per organization (limit check + stale-invite cleanup).
  perform 1 from public.organizations o where o.id = p_org_id for update;

  update public.org_invites
     set revoked_at = now()
   where org_id = p_org_id and email = v_email
     and accepted_at is null and revoked_at is null and expires_at <= now();

  if (select count(*) from public.org_invites i
      where i.org_id = p_org_id and i.accepted_at is null and i.revoked_at is null) >= 50 then
    raise exception 'WK_TOO_MANY_INVITES' using errcode = 'P0001';
  end if;

  begin
    insert into public.org_invites (org_id, email, role, invited_by)
    values (p_org_id, v_email, p_role, v_uid)
    returning * into v_invite;
  exception
    when unique_violation then
      raise exception 'WK_ALREADY_INVITED' using errcode = '23505';
  end;

  return jsonb_build_object('invite_id', v_invite.id, 'org_id', p_org_id, 'email', v_email,
                            'role', p_role, 'status', 'invited', 'expires_at', v_invite.expires_at);
end;
$$;

create or replace function public.my_org_invites()
returns table (
  invite_id  uuid,
  org_id     uuid,
  org_name   text,
  role       public.org_role,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.org_id, o.name, i.role, i.expires_at
  from auth.users u
  join public.org_invites i on i.email = lower(u.email)
  join public.organizations o on o.id = i.org_id
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    and o.status = 'verified'
  order by i.created_at;
$$;

create or replace function public.accept_org_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_invite    public.org_invites%rowtype;
  v_new       boolean;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_uid;

  select * into v_invite from public.org_invites i where i.id = p_invite_id for update;
  -- Same error for "no such invite" and "not your invite": reveals nothing.
  if not found or v_confirmed is null or v_invite.email is distinct from v_email then
    raise exception 'WK_INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    return jsonb_build_object('org_id', v_invite.org_id, 'role', v_invite.role, 'replayed', true);
  end if;
  if v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'WK_INVITE_NOT_FOUND' using errcode = 'P0002', detail = 'invite expired or revoked';
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_invite.org_id and o.status = 'verified') then
    raise exception 'WK_ORG_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  insert into public.org_members (org_id, user_id, role, added_by)
  values (v_invite.org_id, v_uid, v_invite.role, v_invite.invited_by)
  on conflict (org_id, user_id) do nothing;
  v_new := found;

  update public.org_invites set accepted_by = v_uid, accepted_at = now() where id = p_invite_id;

  return jsonb_build_object('org_id', v_invite.org_id, 'role', v_invite.role,
                            'already_member', not v_new, 'replayed', false);
end;
$$;

create or replace function public.revoke_org_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.org_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_invite from public.org_invites i where i.id = p_invite_id for update;
  if not found or not public.is_org_admin(v_invite.org_id) then
    raise exception 'WK_INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    return jsonb_build_object('invite_id', p_invite_id, 'status',
                              case when v_invite.accepted_at is not null then 'accepted' else 'revoked' end,
                              'replayed', true);
  end if;
  update public.org_invites set revoked_at = now() where id = p_invite_id;
  return jsonb_build_object('invite_id', p_invite_id, 'status', 'revoked', 'replayed', false);
end;
$$;

create or replace function public.remove_org_member(p_org_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.org_role;
  v_admins integer;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_org_admin(p_org_id) then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;

  -- Lock the organization row: serializes concurrent removals so two admins
  -- cannot remove each other and leave the organization with no admin.
  perform 1 from public.organizations o where o.id = p_org_id for update;

  select m.role into v_role from public.org_members m
  where m.org_id = p_org_id and m.user_id = p_user_id;
  if not found then
    raise exception 'WK_MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_role = 'org_admin' then
    select count(*) into v_admins from public.org_members m
    where m.org_id = p_org_id and m.role = 'org_admin';
    if v_admins <= 1 then
      raise exception 'WK_LAST_ADMIN' using errcode = 'P0001';
    end if;
  end if;

  delete from public.org_members m where m.org_id = p_org_id and m.user_id = p_user_id;

  return jsonb_build_object('org_id', p_org_id, 'user_id', p_user_id, 'removed', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- search_opportunities (M05): full-text search + filters + sorting + live
-- seat availability. Returns ONLY publicly visible opportunities.
-- websearch_to_tsquery never throws on odd user input.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- shift_availability: seat counts for one opportunity's shifts (counts only,
-- never other volunteers' identities) + the caller's own status.
-- -----------------------------------------------------------------------------
create or replace function public.shift_availability(p_opportunity_id uuid)
returns table (
  shift_id       uuid,
  title          text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  status         public.shift_status,
  capacity       integer,
  waitlist_limit integer,
  confirmed      bigint,
  waitlisted     bigint,
  open_spots     bigint,
  my_signup_id   uuid,
  my_status      public.signup_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.starts_at, s.ends_at, s.status, s.capacity, s.waitlist_limit,
         count(g.id) filter (where g.status = 'confirmed'),
         count(g.id) filter (where g.status = 'waitlisted'),
         greatest(s.capacity - count(g.id) filter (where g.status = 'confirmed'), 0),
         mine.id,
         mine.status
  from public.shifts s
  left join public.signups g on g.shift_id = s.id
  left join lateral (
    select m.id, m.status
    from public.signups m
    where m.shift_id = s.id and m.volunteer_id = (select auth.uid()) and m.status <> 'cancelled'
    limit 1
  ) mine on true
  where s.opportunity_id = p_opportunity_id
    and (public.is_opportunity_public(p_opportunity_id) or public.is_org_member(s.org_id)
         or public.is_platform_admin())
  group by s.id, mine.id, mine.status
  order by s.starts_at;
$$;

-- -----------------------------------------------------------------------------
-- get_shift_roster: staff-only view of who is on a shift (minimal PII:
-- name and skills; no email, no location).
-- -----------------------------------------------------------------------------
create or replace function public.get_shift_roster(p_shift_id uuid)
returns table (
  signup_id         uuid,
  volunteer_id      uuid,
  full_name         text,
  skills            text[],
  status            public.signup_status,
  waitlist_position bigint,
  joined_at         timestamptz,
  hours             numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  select s.org_id into v_org_id from public.shifts s where s.id = p_shift_id;
  if not found or not (public.is_org_member(v_org_id) or public.is_platform_admin()) then
    raise exception 'WK_SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select g.id, g.volunteer_id, p.full_name, p.skills, g.status,
         case when g.status = 'waitlisted'
              then row_number() over (partition by (g.status = 'waitlisted') order by g.queue_seq) end,
         g.created_at,
         pr.hours
  from public.signups g
  join public.profiles p on p.id = g.volunteer_id
  left join public.participation_records pr on pr.signup_id = g.id
  where g.shift_id = p_shift_id
  order by g.status, g.queue_seq;
end;
$$;

-- -----------------------------------------------------------------------------
-- org_dashboard (M05): aggregated metrics for one organization (staff only).
-- -----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (public.is_org_member(p_org_id) or public.is_platform_admin()) then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;

  with upcoming as (
    select s.id, s.capacity,
           (select count(*) from public.signups g where g.shift_id = s.id and g.status = 'confirmed') as confirmed,
           (select count(*) from public.signups g where g.shift_id = s.id and g.status = 'waitlisted') as waitlisted
    from public.shifts s
    where s.org_id = p_org_id and s.status = 'scheduled' and s.starts_at > now()
  ),
  outcomes as (
    select count(*) filter (where g.status = 'attended') as attended,
           count(*) filter (where g.status = 'no_show')  as no_show
    from public.signups g
    where g.org_id = p_org_id
  )
  select jsonb_build_object(
    'opportunities', (
      select jsonb_build_object(
        'draft',     count(*) filter (where op.status = 'draft'),
        'published', count(*) filter (where op.status = 'published'),
        'closed',    count(*) filter (where op.status = 'closed'))
      from public.opportunities op where op.org_id = p_org_id),
    'upcoming_shifts',      (select count(*) from upcoming),
    'upcoming_capacity',    (select coalesce(sum(u.capacity), 0) from upcoming u),
    'upcoming_confirmed',   (select coalesce(sum(u.confirmed), 0) from upcoming u),
    'upcoming_waitlisted',  (select coalesce(sum(u.waitlisted), 0) from upcoming u),
    'fill_rate_pct',        (select case when coalesce(sum(u.capacity), 0) = 0 then 0
                                         else round(100.0 * sum(u.confirmed) / sum(u.capacity), 1) end
                             from upcoming u),
    'verified_hours',       (select coalesce(sum(pr.hours), 0) from public.participation_records pr
                             where pr.org_id = p_org_id),
    'unique_volunteers',    (select count(distinct pr.volunteer_id) from public.participation_records pr
                             where pr.org_id = p_org_id),
    'attended',             (select o.attended from outcomes o),
    'no_show',              (select o.no_show from outcomes o),
    'no_show_rate_pct',     (select case when o.attended + o.no_show = 0 then 0
                                         else round(100.0 * o.no_show / (o.attended + o.no_show), 1) end
                             from outcomes o)
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- my_impact (M05): the signed-in volunteer's own verified contribution.
-- -----------------------------------------------------------------------------
create or replace function public.my_impact()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verified_hours', coalesce((select sum(pr.hours) from public.participation_records pr
                                where pr.volunteer_id = (select auth.uid())), 0),
    'shifts_attended', (select count(*) from public.signups g
                        where g.volunteer_id = (select auth.uid()) and g.status = 'attended'),
    'upcoming_confirmed', (select count(*) from public.signups g
                           where g.volunteer_id = (select auth.uid()) and g.status = 'confirmed'
                             and lower(g.slot) > now()),
    'waitlisted', (select count(*) from public.signups g
                   where g.volunteer_id = (select auth.uid()) and g.status = 'waitlisted'
                     and lower(g.slot) > now()),
    'organizations_helped', (select count(distinct pr.org_id) from public.participation_records pr
                             where pr.volunteer_id = (select auth.uid())),
    'hours_by_cause', coalesce((
      select jsonb_agg(jsonb_build_object('cause', x.cause, 'hours', x.hours) order by x.hours desc)
      from (
        select op.cause, sum(pr.hours) as hours
        from public.participation_records pr
        join public.shifts s on s.id = pr.shift_id
        join public.opportunities op on op.id = s.opportunity_id
        where pr.volunteer_id = (select auth.uid())
        group by op.cause
      ) x), '[]'::jsonb)
  );
$$;

-- =============================================================================
-- Function privileges: deny by default, then grant exactly what clients need.
-- Internal helpers (_signup_result, _promote_waitlist) and trigger functions
-- stay non-executable for API roles.
-- =============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS helpers must be executable by the roles whose queries evaluate policies.
grant execute on function public.is_platform_admin()            to anon, authenticated;
grant execute on function public.is_org_member(uuid)            to anon, authenticated;
grant execute on function public.is_org_admin(uuid)             to anon, authenticated;
grant execute on function public.shares_org_with(uuid)          to authenticated;
grant execute on function public.is_opportunity_public(uuid)    to anon, authenticated;

-- Public read RPCs
grant execute on function public.search_opportunities(text, public.cause_category, text, public.opportunity_mode,
                                                      timestamptz, boolean, text, integer, integer)
  to anon, authenticated;
grant execute on function public.shift_availability(uuid) to anon, authenticated;

-- Signed-in RPCs
grant execute on function public.join_shift(uuid, uuid)                           to authenticated;
grant execute on function public.cancel_signup(uuid, text)                        to authenticated;
grant execute on function public.update_shift_capacity(uuid, integer)             to authenticated;
grant execute on function public.cancel_shift(uuid, text)                         to authenticated;
grant execute on function public.record_attendance(uuid, boolean, numeric, text)  to authenticated;
grant execute on function public.create_organization(text, text, public.cause_category, text, text, text)
  to authenticated;
grant execute on function public.review_organization(uuid, public.org_status, text) to authenticated;
grant execute on function public.invite_org_member(uuid, text, public.org_role)   to authenticated;
grant execute on function public.my_org_invites()                                 to authenticated;
grant execute on function public.accept_org_invite(uuid)                          to authenticated;
grant execute on function public.revoke_org_invite(uuid)                          to authenticated;
grant execute on function public.remove_org_member(uuid, uuid)                    to authenticated;
grant execute on function public.get_shift_roster(uuid)                           to authenticated;
grant execute on function public.org_dashboard(uuid)                              to authenticated;
grant execute on function public.my_impact()                                      to authenticated;
