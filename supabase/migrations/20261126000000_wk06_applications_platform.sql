-- =============================================================================
-- Worldkin Roster — Migration 06: applications, offers, complaints, feedback,
-- notifications, richer profiles/organizations, admin moderation, statistics.
-- -----------------------------------------------------------------------------
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
-- Additive only: no column/table is dropped, no data is rewritten. Existing
-- rows get safe defaults (voluntary, open selection = today's behaviour).
-- Booking rules stay in ONE place: join_shift and accept_offer both call
-- _join_shift_core (volunteer lock -> shift lock -> capacity/waitlist/
-- conflict/idempotency). See docs/DESIGN_DECISIONS.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.compensation_type  as enum ('voluntary', 'stipend', 'paid');
create type public.selection_mode     as enum ('open', 'application');
create type public.application_status as enum ('submitted', 'under_review', 'selected', 'rejected', 'withdrawn', 'declined', 'expired');
create type public.offer_status       as enum ('pending', 'accepted', 'declined', 'expired', 'revoked');
create type public.complaint_status   as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.feedback_status    as enum ('published', 'hidden');
create type public.org_type           as enum ('ngo', 'charity', 'community_group', 'social_enterprise', 'government', 'international', 'academic', 'other');

-- -----------------------------------------------------------------------------
-- 2. Profiles: richer volunteer profile + suspension (admin-only columns)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column education        text check (char_length(education) <= 300),
  add column interests        text[] not null default '{}' check (cardinality(interests) <= 20),
  add column languages        text[] not null default '{}' check (cardinality(languages) <= 15),
  add column availability     text check (char_length(availability) <= 300),
  add column experience       text check (char_length(experience) <= 2000),
  add column avatar_url       text check (avatar_url ~* '^https://[^\s]+$' and char_length(avatar_url) <= 500),
  add column suspended_at     timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 500);

grant update (education, interests, languages, availability, experience, avatar_url) on public.profiles to authenticated;

-- Private contact data: owner (and platform admins) only. Never returned by
-- public or organization-facing functions.
create table public.profile_private (
  id         uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  phone      text check (phone ~ '^\+?[0-9 ()-]{6,20}$'),
  updated_at timestamptz not null default now()
);
create trigger profile_private_set_updated_at before update on public.profile_private
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Organizations: public details + private verification data
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column org_type       public.org_type not null default 'ngo',
  add column city           text check (char_length(city) <= 80),
  add column phone          text check (phone ~ '^\+?[0-9 ()-]{6,20}$'),
  add column official_email text check (official_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(official_email) <= 254),
  add column logo_url       text check (logo_url ~* '^https://[^\s]+$' and char_length(logo_url) <= 500);

grant update (org_type, city, phone, official_email, logo_url) on public.organizations to authenticated;

create table public.organization_private (
  org_id              uuid primary key references public.organizations (id) on delete cascade,
  address             text check (char_length(address) <= 300),
  registration_id     text check (char_length(registration_id) <= 100),
  representative_name text check (char_length(representative_name) <= 120),
  representative_role text check (char_length(representative_role) <= 120),
  verification_docs   text[] not null default '{}' check (cardinality(verification_docs) <= 5),
  updated_at          timestamptz not null default now()
);
create trigger organization_private_set_updated_at before update on public.organization_private
  for each row execute function public.tg_set_updated_at();
create trigger organization_private_audit after insert or update on public.organization_private
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- 4. Opportunities: compensation, application mode, deadline, moderation
-- -----------------------------------------------------------------------------
alter table public.opportunities
  add column compensation_type    public.compensation_type not null default 'voluntary',
  add column compensation_details text check (char_length(compensation_details) <= 500),
  add column application_deadline timestamptz,
  add column selection_mode       public.selection_mode not null default 'open',
  add column moderation_reason    text check (char_length(moderation_reason) <= 500),
  add column moderated_at         timestamptz,
  add constraint opportunities_compensation_details_required
    check (compensation_type = 'voluntary' or char_length(btrim(coalesce(compensation_details, ''))) >= 3),
  add constraint opportunities_deadline_needs_application
    check (application_deadline is null or selection_mode = 'application');

grant insert (compensation_type, compensation_details, application_deadline, selection_mode) on public.opportunities to authenticated;
grant update (compensation_type, compensation_details, application_deadline, selection_mode) on public.opportunities to authenticated;

create index opportunities_deadline_idx on public.opportunities (application_deadline)
  where status = 'published' and application_deadline is not null;

-- -----------------------------------------------------------------------------
-- 5. Applications, private review notes, offers
-- -----------------------------------------------------------------------------
create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null,
  org_id          uuid not null,
  volunteer_id    uuid not null references public.profiles (id) on delete restrict,
  status          public.application_status not null default 'submitted',
  message         text check (char_length(message) <= 2000),
  decision_reason text check (char_length(decision_reason) <= 500),
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint applications_opportunity_org_fkey foreign key (opportunity_id, org_id)
    references public.opportunities (id, org_id) on delete restrict,
  constraint applications_id_org_key unique (id, org_id)
);
-- One ACTIVE application per volunteer per opportunity (re-apply after a final outcome is allowed).
create unique index applications_one_active on public.applications (volunteer_id, opportunity_id)
  where status in ('submitted', 'under_review', 'selected');
create index applications_org_idx on public.applications (org_id, status, created_at desc);
create index applications_volunteer_idx on public.applications (volunteer_id, created_at desc);
create index applications_opportunity_idx on public.applications (opportunity_id);
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.tg_set_updated_at();
create trigger applications_audit after insert or update on public.applications
  for each row execute function public.tg_audit();

create table public.application_notes (
  application_id uuid primary key references public.applications (id) on delete cascade,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  note           text not null check (char_length(note) <= 2000),
  updated_by     uuid references public.profiles (id) on delete set null,
  updated_at     timestamptz not null default now()
);

create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  org_id         uuid not null,
  shift_id       uuid not null,
  volunteer_id   uuid not null references public.profiles (id) on delete restrict,
  status         public.offer_status not null default 'pending',
  expires_at     timestamptz not null,
  message        text check (char_length(message) <= 1000),
  responded_at   timestamptz,
  signup_id      uuid references public.signups (id) on delete restrict,
  created_by     uuid not null references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint offers_application_org_fkey foreign key (application_id, org_id)
    references public.applications (id, org_id) on delete restrict,
  constraint offers_shift_org_fkey foreign key (shift_id, org_id)
    references public.shifts (id, org_id) on delete restrict,
  constraint offers_accepted_has_signup check (status <> 'accepted' or signup_id is not null),
  constraint offers_expiry_after_creation check (expires_at > created_at)
);
create unique index offers_one_pending on public.offers (application_id) where status = 'pending';
create index offers_application_idx on public.offers (application_id, status);
create index offers_volunteer_idx on public.offers (volunteer_id, status);
create index offers_shift_idx on public.offers (shift_id);
create index offers_pending_expiry_idx on public.offers (expires_at) where status = 'pending';
create trigger offers_set_updated_at before update on public.offers
  for each row execute function public.tg_set_updated_at();
create trigger offers_audit after insert or update on public.offers
  for each row execute function public.tg_audit();

-- Defence in depth: an offer's shift belongs to the application's opportunity
-- and the offer is for the application's volunteer (also checked by send_offer).
create or replace function public.tg_offers_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.applications a
    join public.shifts s on s.opportunity_id = a.opportunity_id
    where a.id = new.application_id and s.id = new.shift_id and a.volunteer_id = new.volunteer_id
  ) then
    raise exception 'WK_SHIFT_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger offers_consistency before insert on public.offers
  for each row execute function public.tg_offers_consistency();

-- -----------------------------------------------------------------------------
-- 6. Private complaints, public feedback, notifications
-- -----------------------------------------------------------------------------
create table public.complaints (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles (id) on delete restrict,
  org_id         uuid references public.organizations (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  subject        text not null check (char_length(btrim(subject)) between 3 and 140),
  description    text not null check (char_length(btrim(description)) between 10 and 4000),
  status         public.complaint_status not null default 'open',
  admin_response text check (char_length(admin_response) <= 2000),
  handled_by     uuid references public.profiles (id) on delete set null,
  handled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index complaints_status_idx on public.complaints (status, created_at desc);
create index complaints_reporter_idx on public.complaints (reporter_id, created_at desc);
create trigger complaints_set_updated_at before update on public.complaints
  for each row execute function public.tg_set_updated_at();
-- No generic audit trigger: tg_audit would file rows under org_id and let that
-- organization read complaints about itself. Admin actions are audited explicitly.

create table public.feedback (
  id                uuid primary key default gen_random_uuid(),
  participation_id  uuid not null unique references public.participation_records (id) on delete restrict,
  volunteer_id      uuid not null references public.profiles (id) on delete restrict,
  org_id            uuid not null references public.organizations (id) on delete restrict,
  opportunity_id    uuid not null references public.opportunities (id) on delete restrict,
  rating            smallint not null check (rating between 1 and 5),
  comment           text check (char_length(comment) <= 1000),
  status            public.feedback_status not null default 'published',
  moderated_by      uuid references public.profiles (id) on delete set null,
  moderated_at      timestamptz,
  moderation_reason text check (char_length(moderation_reason) <= 500),
  created_at        timestamptz not null default now()
);
create index feedback_org_idx on public.feedback (org_id, status, created_at desc);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (char_length(kind) <= 40),
  title      text not null check (char_length(title) <= 160),
  body       text check (char_length(body) <= 500),
  link       text check (link ~ '^/[A-Za-z0-9]' and char_length(link) <= 300),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- -----------------------------------------------------------------------------
-- 7. RLS + privileges for new tables (deny by default)
-- -----------------------------------------------------------------------------
alter table public.profile_private      enable row level security;
alter table public.organization_private enable row level security;
alter table public.applications         enable row level security;
alter table public.application_notes    enable row level security;
alter table public.offers               enable row level security;
alter table public.complaints           enable row level security;
alter table public.feedback             enable row level security;
alter table public.notifications        enable row level security;

revoke all on table
  public.profile_private, public.organization_private, public.applications, public.application_notes,
  public.offers, public.complaints, public.feedback, public.notifications
from anon, authenticated;

grant select on public.profile_private to authenticated;
grant insert (id, phone) on public.profile_private to authenticated;
grant update (phone) on public.profile_private to authenticated;
create policy profile_private_select on public.profile_private
  for select to authenticated using (id = (select auth.uid()) or public.is_platform_admin());
create policy profile_private_insert on public.profile_private
  for insert to authenticated with check (id = (select auth.uid()));
create policy profile_private_update on public.profile_private
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.organization_private to authenticated;
grant insert (org_id, address, registration_id, representative_name, representative_role, verification_docs)
  on public.organization_private to authenticated;
grant update (address, registration_id, representative_name, representative_role, verification_docs)
  on public.organization_private to authenticated;
create policy organization_private_select on public.organization_private
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy organization_private_insert on public.organization_private
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy organization_private_update on public.organization_private
  for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Applications / offers: read own, own organization's, or everything as platform admin. Writes: RPC only.
grant select on public.applications to authenticated;
create policy applications_select on public.applications
  for select to authenticated
  using (volunteer_id = (select auth.uid()) or public.is_org_member(org_id) or public.is_platform_admin());

grant select on public.application_notes to authenticated;
create policy application_notes_select on public.application_notes
  for select to authenticated using (public.is_org_member(org_id));

grant select on public.offers to authenticated;
create policy offers_select on public.offers
  for select to authenticated
  using (volunteer_id = (select auth.uid()) or public.is_org_member(org_id) or public.is_platform_admin());

-- Complaints are private to the reporter and platform admins.
grant select on public.complaints to authenticated;
create policy complaints_select on public.complaints
  for select to authenticated using (reporter_id = (select auth.uid()) or public.is_platform_admin());

-- Feedback rows: author and platform admins; public output only via org_feedback().
grant select on public.feedback to authenticated;
create policy feedback_select on public.feedback
  for select to authenticated using (volunteer_id = (select auth.uid()) or public.is_platform_admin());

-- Notifications: own only; the only writable column is read_at.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 8. Internal helpers (never executable through the API)
-- -----------------------------------------------------------------------------
create or replace function public._notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, left(p_title, 160), left(p_body, 500), p_link
  where p_user is not null;
$$;

create or replace function public._notify_org_admins(p_org uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, p_kind, left(p_title, 160), left(p_body, 500), p_link
  from public.org_members m
  where m.org_id = p_org and m.role = 'org_admin';
$$;

create or replace function public._assert_active(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = p_uid and p.suspended_at is not null) then
    raise exception 'WK_ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
end;
$$;

-- Marks stale pending offers (and their applications) expired. SKIP LOCKED:
-- rows being accepted/revoked right now are left to that transaction, so list
-- reads never wait on, or deadlock with, a decision in progress.
create or replace function public._expire_offers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.offers o
     set status = 'expired'
   where o.id in (
     select x.id from public.offers x
     where x.status = 'pending' and x.expires_at <= now()
     for update skip locked
   );
  update public.applications a
     set status = 'expired'
   where a.id in (
     select a2.id from public.applications a2
     where a2.status = 'selected'
       and exists (select 1 from public.offers o where o.application_id = a2.id and o.status = 'expired')
       and not exists (select 1 from public.offers o where o.application_id = a2.id and o.status in ('pending', 'accepted'))
     for update skip locked
   );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Booking core (moved out of join_shift; behaviour unchanged for 'open'
--    opportunities). p_via_offer = true only when called by accept_offer.
-- -----------------------------------------------------------------------------
create or replace function public._join_shift_core(p_uid uuid, p_shift_id uuid, p_idempotency_key uuid, p_via_offer boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := p_uid;
  v_shift      public.shifts%rowtype;
  v_opp_status text;
  v_org_status text;
  v_sel_mode   text;
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

  -- (0) Serialize this volunteer's own joins. Lock order: volunteer -> shift -> signup.
  perform 1 from public.profiles p where p.id = v_uid for no key update;
  perform public._assert_active(v_uid);

  -- (1) Serialize every seat decision for this shift.
  select * into v_shift from public.shifts s where s.id = p_shift_id for update;
  if not found then
    raise exception 'WK_SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- (2) Idempotent replay.
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
  select op.status::text, o.status::text, op.selection_mode::text
    into v_opp_status, v_org_status, v_sel_mode
  from public.opportunities op
  join public.organizations o on o.id = op.org_id
  where op.id = v_shift.opportunity_id;

  if v_org_status <> 'verified' or v_opp_status <> 'published' then
    raise exception 'WK_SHIFT_NOT_OPEN' using errcode = 'P0001',
      detail = format('organization=%s opportunity=%s', v_org_status, v_opp_status);
  end if;
  if v_sel_mode = 'application' and not coalesce(p_via_offer, false) then
    raise exception 'WK_APPLICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'WK_SHIFT_CANCELLED' using errcode = 'P0001';
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'WK_SHIFT_STARTED' using errcode = 'P0001';
  end if;

  -- (3b) Skill eligibility.
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

  -- (4) Duplicate action.
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

create or replace function public.join_shift(p_shift_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._join_shift_core(auth.uid(), p_shift_id, p_idempotency_key, false);
end;
$$;

-- Selection mode cannot change once applications or signups exist.
create or replace function public.tg_opportunities_selection_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.selection_mode is distinct from old.selection_mode and (
       exists (select 1 from public.applications a where a.opportunity_id = old.id)
       or exists (select 1 from public.signups g join public.shifts s on s.id = g.shift_id where s.opportunity_id = old.id)
     ) then
    raise exception 'WK_IMMUTABLE_FIELD' using errcode = '42501', detail = 'selection_mode after applications or sign-ups';
  end if;
  return new;
end;
$$;
create trigger opportunities_selection_guard before update of selection_mode on public.opportunities
  for each row execute function public.tg_opportunities_selection_guard();

-- -----------------------------------------------------------------------------
-- 10. Application and hiring workflow
-- -----------------------------------------------------------------------------
create or replace function public.apply_to_opportunity(p_opportunity_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_op       public.opportunities%rowtype;
  v_org      text;
  v_existing public.applications%rowtype;
  v_app      public.applications%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform 1 from public.profiles p where p.id = v_uid for no key update;
  perform public._assert_active(v_uid);

  select * into v_op from public.opportunities op where op.id = p_opportunity_id;
  if not found then
    raise exception 'WK_OPPORTUNITY_NOT_FOUND' using errcode = 'P0002';
  end if;
  select o.status::text into v_org from public.organizations o where o.id = v_op.org_id;
  if v_org <> 'verified' or v_op.status <> 'published' then
    raise exception 'WK_OPPORTUNITY_CLOSED' using errcode = 'P0001';
  end if;
  if v_op.selection_mode <> 'application' then
    raise exception 'WK_APPLICATION_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_op.application_deadline is not null and v_op.application_deadline <= now() then
    raise exception 'WK_APPLICATION_DEADLINE_PASSED' using errcode = 'P0001';
  end if;
  if public.is_org_member(v_op.org_id) then
    raise exception 'WK_CONFLICT_OF_INTEREST' using errcode = '42501';
  end if;
  if v_op.requires_skill_match and not exists (
       select 1 from public.profiles p
       cross join lateral unnest(p.skills) as have(skill)
       cross join lateral unnest(v_op.skills_wanted) as want(skill)
       where p.id = v_uid and lower(btrim(have.skill)) = lower(btrim(want.skill))) then
    raise exception 'WK_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  -- Idempotent: a retry (or second tab) returns the existing active application.
  select * into v_existing from public.applications a
  where a.volunteer_id = v_uid and a.opportunity_id = p_opportunity_id
    and a.status in ('submitted', 'under_review', 'selected');
  if found then
    return jsonb_build_object('application_id', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;

  begin
    insert into public.applications (opportunity_id, org_id, volunteer_id, message)
    values (p_opportunity_id, v_op.org_id, v_uid, nullif(btrim(p_message), ''))
    returning * into v_app;
  exception
    when unique_violation then
      raise exception 'WK_ALREADY_APPLIED' using errcode = '23505';
    when check_violation then
      raise exception 'WK_INVALID_INPUT' using errcode = '22023';
  end;

  perform public._notify_org_admins(v_op.org_id, 'application_new', 'New application: ' || v_op.title,
    'A volunteer applied. Review it in Applicants.', '/org/' || v_op.org_id || '/applications');
  return jsonb_build_object('application_id', v_app.id, 'status', v_app.status, 'replayed', false);
end;
$$;

create or replace function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform 1 from public.profiles p where p.id = v_uid for no key update;
  select * into v_app from public.applications a where a.id = p_application_id for update;
  if not found or v_app.volunteer_id <> v_uid then
    raise exception 'WK_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_app.status not in ('submitted', 'under_review', 'selected')
     or exists (select 1 from public.offers o where o.application_id = v_app.id and o.status = 'accepted') then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001', detail = 'withdrawal is possible only before an offer is accepted';
  end if;
  update public.offers set status = 'declined', responded_at = now()
   where application_id = v_app.id and status = 'pending';
  update public.applications set status = 'withdrawn' where id = v_app.id;
  perform public._notify_org_admins(v_app.org_id, 'application_withdrawn', 'An applicant withdrew',
    'An application was withdrawn by the volunteer.', '/org/' || v_app.org_id || '/applications');
end;
$$;

-- p_action: 'under_review' | 'reject' | 'note' (note only). Org staff only.
create or replace function public.review_application(
  p_application_id uuid, p_action text, p_reason text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_app   public.applications%rowtype;
  v_title text;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_app from public.applications a where a.id = p_application_id for update;
  if not found or not public.is_org_member(v_app.org_id) then
    raise exception 'WK_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  select op.title into v_title from public.opportunities op where op.id = v_app.opportunity_id;

  if p_note is not null then
    insert into public.application_notes (application_id, org_id, note, updated_by)
    values (v_app.id, v_app.org_id, left(btrim(p_note), 2000), v_uid)
    on conflict (application_id) do update set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  end if;

  if p_action = 'under_review' then
    if v_app.status <> 'submitted' then
      raise exception 'WK_INVALID_STATE' using errcode = 'P0001';
    end if;
    update public.applications set status = 'under_review', decided_by = v_uid, decided_at = now() where id = v_app.id;
    perform public._notify(v_app.volunteer_id, 'application_review', 'Your application is under review',
      v_title, '/me/applications');
  elsif p_action = 'reject' then
    if v_app.status not in ('submitted', 'under_review', 'selected', 'expired')
       or exists (select 1 from public.offers o where o.application_id = v_app.id and o.status = 'accepted') then
      raise exception 'WK_INVALID_STATE' using errcode = 'P0001';
    end if;
    update public.offers set status = 'revoked', responded_at = now()
     where application_id = v_app.id and status = 'pending';
    update public.applications
       set status = 'rejected', decision_reason = nullif(left(btrim(p_reason), 500), ''), decided_by = v_uid, decided_at = now()
     where id = v_app.id;
    perform public._notify(v_app.volunteer_id, 'application_rejected', 'Application not selected',
      coalesce(v_title, '') || coalesce(': ' || nullif(btrim(p_reason), ''), ''), '/me/applications');
  elsif p_action = 'note' then
    if p_note is null then
      raise exception 'WK_INVALID_INPUT' using errcode = '22023';
    end if;
  else
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = 'unknown action';
  end if;
end;
$$;

create or replace function public.send_offer(p_application_id uuid, p_shift_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_app     public.applications%rowtype;
  v_shift   public.shifts%rowtype;
  v_title   text;
  v_op_stat text;
  v_offer   public.offers%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_app from public.applications a where a.id = p_application_id for update;
  if not found or not public.is_org_member(v_app.org_id) then
    raise exception 'WK_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_app.status not in ('submitted', 'under_review', 'selected', 'expired') then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.offers o where o.application_id = v_app.id and o.status in ('pending', 'accepted')) then
    raise exception 'WK_OFFER_EXISTS' using errcode = '23505';
  end if;

  select * into v_shift from public.shifts s where s.id = p_shift_id;
  if not found or v_shift.opportunity_id <> v_app.opportunity_id then
    raise exception 'WK_SHIFT_MISMATCH' using errcode = '23514';
  end if;
  if v_shift.status <> 'scheduled' then
    raise exception 'WK_SHIFT_CANCELLED' using errcode = 'P0001';
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'WK_SHIFT_STARTED' using errcode = 'P0001';
  end if;
  select op.status::text, op.title into v_op_stat, v_title from public.opportunities op where op.id = v_app.opportunity_id;
  if v_op_stat <> 'published' then
    raise exception 'WK_OPPORTUNITY_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.offers (application_id, org_id, shift_id, volunteer_id, expires_at, message, created_by)
  values (v_app.id, v_app.org_id, v_shift.id, v_app.volunteer_id,
          least(now() + interval '72 hours', v_shift.starts_at), nullif(left(btrim(p_message), 1000), ''), v_uid)
  returning * into v_offer;
  update public.applications set status = 'selected', decided_by = v_uid, decided_at = now() where id = v_app.id;

  perform public._notify(v_app.volunteer_id, 'offer_new', 'You have been selected: ' || v_title,
    'Accept or decline your offer before it expires.', '/me/applications');
  return jsonb_build_object('offer_id', v_offer.id, 'expires_at', v_offer.expires_at);
end;
$$;

create or replace function public.revoke_offer(p_offer_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_offer public.offers%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform 1 from public.applications a
   where a.id = (select o.application_id from public.offers o where o.id = p_offer_id)
   for update;
  select * into v_offer from public.offers o where o.id = p_offer_id for update;
  if not found or not public.is_org_member(v_offer.org_id) then
    raise exception 'WK_OFFER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001', detail = v_offer.status::text;
  end if;
  update public.offers set status = 'revoked', responded_at = now() where id = v_offer.id;
  update public.applications set status = 'under_review' where id = v_offer.application_id and status = 'selected';
  perform public._notify(v_offer.volunteer_id, 'offer_revoked', 'An offer was withdrawn by the organization',
    nullif(left(btrim(p_reason), 300), ''), '/me/applications');
end;
$$;

create or replace function public.accept_offer(p_offer_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_offer  public.offers%rowtype;
  v_app    public.application_status;
  v_signup public.signups%rowtype;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  -- Lock order everywhere: volunteer -> application -> offer -> shift (in the
  -- booking core) -> signup. Org-side actions take application -> offer too.
  perform 1 from public.profiles p where p.id = v_uid for no key update;
  perform 1 from public.applications a
   where a.id = (select o.application_id from public.offers o where o.id = p_offer_id)
   for update;
  select * into v_offer from public.offers o where o.id = p_offer_id for update;
  if not found or v_offer.volunteer_id <> v_uid then
    raise exception 'WK_OFFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_offer.status = 'accepted' then   -- retry of a successful acceptance
    select * into v_signup from public.signups g where g.id = v_offer.signup_id;
    return public._signup_result(v_signup, true) || jsonb_build_object('offer_id', v_offer.id);
  end if;
  if v_offer.status = 'revoked' then
    raise exception 'WK_OFFER_REVOKED' using errcode = 'P0001';
  end if;
  if v_offer.status = 'declined' then
    raise exception 'WK_OFFER_DECLINED' using errcode = 'P0001';
  end if;
  if v_offer.status = 'expired' or v_offer.expires_at <= now() then
    raise exception 'WK_OFFER_EXPIRED' using errcode = 'P0001';
  end if;
  select a.status into v_app from public.applications a where a.id = v_offer.application_id;
  if v_app <> 'selected' then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001';
  end if;

  -- Same booking rules as join_shift (capacity, FIFO waitlist, conflicts, idempotency).
  v_result := public._join_shift_core(v_uid, v_offer.shift_id, p_idempotency_key, true);

  update public.offers
     set status = 'accepted', responded_at = now(), signup_id = (v_result ->> 'signup_id')::uuid
   where id = v_offer.id;
  perform public._notify_org_admins(v_offer.org_id, 'offer_accepted', 'Offer accepted',
    'A volunteer accepted an offer (' || (v_result ->> 'status') || ').', '/org/' || v_offer.org_id || '/applications');
  return v_result || jsonb_build_object('offer_id', v_offer.id);
end;
$$;

create or replace function public.decline_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_offer public.offers%rowtype;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform 1 from public.profiles p where p.id = v_uid for no key update;
  perform 1 from public.applications a
   where a.id = (select o.application_id from public.offers o where o.id = p_offer_id)
   for update;
  select * into v_offer from public.offers o where o.id = p_offer_id for update;
  if not found or v_offer.volunteer_id <> v_uid then
    raise exception 'WK_OFFER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'WK_INVALID_STATE' using errcode = 'P0001', detail = v_offer.status::text;
  end if;
  if v_offer.expires_at <= now() then
    raise exception 'WK_OFFER_EXPIRED' using errcode = 'P0001';
  end if;
  update public.offers set status = 'declined', responded_at = now() where id = v_offer.id;
  update public.applications set status = 'declined' where id = v_offer.application_id;
  perform public._notify_org_admins(v_offer.org_id, 'offer_declined', 'Offer declined',
    'A volunteer declined an offer.', '/org/' || v_offer.org_id || '/applications');
end;
$$;

create or replace function public.my_applications()
returns table (
  application_id uuid, opportunity_id uuid, opportunity_title text, org_id uuid, org_name text,
  status public.application_status, message text, decision_reason text, created_at timestamptz, updated_at timestamptz,
  offer_id uuid, offer_status public.offer_status, offer_expires_at timestamptz, offer_message text,
  shift_id uuid, shift_title text, shift_starts_at timestamptz, shift_ends_at timestamptz,
  signup_id uuid, signup_status public.signup_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public._expire_offers();
  return query
  select a.id, a.opportunity_id, op.title, a.org_id, o.name, a.status, a.message, a.decision_reason,
         a.created_at, a.updated_at, lo.id, lo.status, lo.expires_at, lo.message,
         s.id, s.title, s.starts_at, s.ends_at, g.id, g.status
  from public.applications a
  join public.opportunities op on op.id = a.opportunity_id
  join public.organizations o on o.id = a.org_id
  left join lateral (
    select x.* from public.offers x where x.application_id = a.id order by x.created_at desc limit 1
  ) lo on true
  left join public.shifts s on s.id = lo.shift_id
  left join public.signups g on g.id = lo.signup_id
  where a.volunteer_id = auth.uid()
  order by a.created_at desc
  limit 200;
end;
$$;

-- Applicant review for organization staff: no phone, no email, no address.
create or replace function public.org_applications(
  p_org_id uuid, p_opportunity_id uuid default null, p_status public.application_status default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  application_id uuid, opportunity_id uuid, opportunity_title text, volunteer_id uuid,
  applicant_name text, applicant_country text, applicant_city text, applicant_bio text,
  applicant_skills text[], applicant_interests text[], applicant_languages text[],
  applicant_education text, applicant_experience text, applicant_availability text, applicant_verified_hours numeric,
  status public.application_status, message text, decision_reason text, note text, created_at timestamptz,
  offer_id uuid, offer_status public.offer_status, offer_expires_at timestamptz,
  shift_id uuid, shift_starts_at timestamptz, signup_status public.signup_status, total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  perform public._expire_offers();
  return query
  select a.id, a.opportunity_id, op.title, a.volunteer_id,
         p.full_name, p.country_code, p.city, p.bio, p.skills, p.interests, p.languages,
         p.education, p.experience, p.availability,
         coalesce((select sum(pr.hours) from public.participation_records pr where pr.volunteer_id = a.volunteer_id), 0),
         a.status, a.message, a.decision_reason, n.note, a.created_at,
         lo.id, lo.status, lo.expires_at, lo.shift_id, s.starts_at, g.status,
         count(*) over ()
  from public.applications a
  join public.opportunities op on op.id = a.opportunity_id
  join public.profiles p on p.id = a.volunteer_id
  left join public.application_notes n on n.application_id = a.id
  left join lateral (
    select x.* from public.offers x where x.application_id = a.id order by x.created_at desc limit 1
  ) lo on true
  left join public.shifts s on s.id = lo.shift_id
  left join public.signups g on g.id = lo.signup_id
  where a.org_id = p_org_id
    and (p_opportunity_id is null or a.opportunity_id = p_opportunity_id)
    and (p_status is null or a.status = p_status)
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Participation history, feedback
-- -----------------------------------------------------------------------------
create or replace function public.my_participation()
returns table (
  participation_id uuid, shift_id uuid, shift_title text, starts_at timestamptz, ends_at timestamptz,
  opportunity_id uuid, opportunity_title text, cause public.cause_category, org_id uuid, org_name text,
  hours numeric, verified_at timestamptz, feedback_id uuid, feedback_rating smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, s.id, s.title, s.starts_at, s.ends_at, op.id, op.title, op.cause, o.id, o.name,
         pr.hours, pr.verified_at, f.id, f.rating
  from public.participation_records pr
  join public.shifts s on s.id = pr.shift_id
  join public.opportunities op on op.id = s.opportunity_id
  join public.organizations o on o.id = pr.org_id
  left join public.feedback f on f.participation_id = pr.id
  where pr.volunteer_id = (select auth.uid())
  order by s.starts_at desc
  limit 500;
$$;

create or replace function public.submit_feedback(p_participation_id uuid, p_rating integer, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pr  public.participation_records%rowtype;
  v_opp uuid;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public._assert_active(v_uid);
  select * into v_pr from public.participation_records pr where pr.id = p_participation_id;
  if not found or v_pr.volunteer_id <> v_uid then
    raise exception 'WK_PARTICIPATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = 'rating 1-5';
  end if;
  select s.opportunity_id into v_opp from public.shifts s where s.id = v_pr.shift_id;
  begin
    insert into public.feedback (participation_id, volunteer_id, org_id, opportunity_id, rating, comment)
    values (v_pr.id, v_uid, v_pr.org_id, v_opp, p_rating, nullif(left(btrim(p_comment), 1000), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'WK_ALREADY_REVIEWED' using errcode = '23505';
  end;
  perform public._notify_org_admins(v_pr.org_id, 'feedback_new', 'New volunteer feedback',
    p_rating || '/5', '/org/' || v_pr.org_id);
  return v_id;
end;
$$;

-- Public: published feedback only, first name only.
create or replace function public.org_feedback(p_org_id uuid, p_limit integer default 20, p_offset integer default 0)
returns table (
  feedback_id uuid, rating smallint, comment text, created_at timestamptz, reviewer_first_name text,
  opportunity_title text, average_rating numeric, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.rating, f.comment, f.created_at, split_part(btrim(p.full_name), ' ', 1), op.title,
         round(avg(f.rating) over (), 1), count(*) over ()
  from public.feedback f
  join public.profiles p on p.id = f.volunteer_id
  join public.opportunities op on op.id = f.opportunity_id
  join public.organizations o on o.id = f.org_id
  where f.org_id = p_org_id and f.status = 'published'
    and (o.status = 'verified' or public.is_org_member(o.id) or public.is_platform_admin())
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.moderate_feedback(p_feedback_id uuid, p_status public.feedback_status, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  update public.feedback
     set status = p_status, moderated_by = auth.uid(), moderated_at = now(),
         moderation_reason = nullif(left(btrim(p_reason), 500), '')
   where id = p_feedback_id;
  if not found then
    raise exception 'WK_INVALID_INPUT' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, details)
  values (auth.uid(), null, 'moderate', 'feedback', p_feedback_id, jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Private complaints
-- -----------------------------------------------------------------------------
create or replace function public.submit_complaint(
  p_subject text, p_description text, p_org_id uuid default null, p_opportunity_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'WK_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if (select count(*) from public.complaints c where c.reporter_id = v_uid and c.status in ('open', 'in_review')) >= 5 then
    raise exception 'WK_TOO_MANY_COMPLAINTS' using errcode = 'P0001';
  end if;
  if p_org_id is not null and not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'WK_ORG_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_opportunity_id is not null and not exists (select 1 from public.opportunities op where op.id = p_opportunity_id) then
    raise exception 'WK_OPPORTUNITY_NOT_FOUND' using errcode = 'P0002';
  end if;
  begin
    insert into public.complaints (reporter_id, org_id, opportunity_id, subject, description)
    values (v_uid, p_org_id, p_opportunity_id, btrim(p_subject), btrim(p_description))
    returning id into v_id;
  exception when check_violation or not_null_violation then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023';
  end;
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'complaint_new', 'New complaint', left(btrim(p_subject), 160), '/admin'
  from public.profiles p where p.platform_role = 'platform_admin';
  return v_id;
end;
$$;

create or replace function public.respond_complaint(p_complaint_id uuid, p_status public.complaint_status, p_response text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.complaints%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_c from public.complaints c where c.id = p_complaint_id for update;
  if not found then
    raise exception 'WK_COMPLAINT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_c.status in ('resolved', 'dismissed') or p_status = 'open' then
    raise exception 'WK_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status in ('resolved', 'dismissed') and nullif(btrim(p_response), '') is null then
    raise exception 'WK_REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.complaints
     set status = p_status, admin_response = coalesce(nullif(left(btrim(p_response), 2000), ''), admin_response),
         handled_by = auth.uid(), handled_at = now()
   where id = v_c.id;
  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, details)
  values (auth.uid(), null, 'respond', 'complaints', v_c.id, jsonb_build_object('status', p_status));
  perform public._notify(v_c.reporter_id, 'complaint_update', 'Your complaint was updated: ' || p_status::text,
    left(v_c.subject, 160), '/me/complaints');
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. Platform administration
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_suspension(p_user_id uuid, p_suspend boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.platform_role;
begin
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501', detail = 'cannot suspend yourself';
  end if;
  select p.platform_role into v_role from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'WK_USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_role = 'platform_admin' then
    raise exception 'WK_FORBIDDEN' using errcode = '42501', detail = 'platform admins are managed by the operator';
  end if;
  if p_suspend and nullif(btrim(p_reason), '') is null then
    raise exception 'WK_REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.profiles
     set suspended_at = case when p_suspend then now() end,
         suspended_reason = case when p_suspend then left(btrim(p_reason), 500) end
   where id = p_user_id;
  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, details)
  values (auth.uid(), null, case when p_suspend then 'suspend' else 'unsuspend' end, 'profiles', p_user_id,
          jsonb_build_object('reason', p_reason));
  perform public._notify(p_user_id, 'account_status',
    case when p_suspend then 'Your account has been suspended' else 'Your account has been restored' end,
    p_reason, '/me');
end;
$$;

create or replace function public.admin_users(p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, full_name text, email text, country_code text, city text, platform_role public.platform_role,
  suspended_at timestamptz, suspended_reason text, created_at timestamptz,
  org_count bigint, signup_count bigint, application_count bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, u.email::text, p.country_code, p.city, p.platform_role, p.suspended_at, p.suspended_reason, p.created_at,
         (select count(*) from public.org_members m where m.user_id = p.id),
         (select count(*) from public.signups g where g.volunteer_id = p.id),
         (select count(*) from public.applications a where a.volunteer_id = p.id),
         count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  where nullif(btrim(p_query), '') is null
     or p.full_name ilike '%' || btrim(p_query) || '%'
     or u.email ilike '%' || btrim(p_query) || '%'
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_moderate_opportunity(p_opportunity_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.opportunities%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'WK_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_op from public.opportunities op where op.id = p_opportunity_id for update;
  if not found then
    raise exception 'WK_OPPORTUNITY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_op.status = 'closed' then
    raise exception 'WK_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.opportunities
     set status = 'closed', moderation_reason = left(btrim(p_reason), 500), moderated_at = now()
   where id = v_op.id;
  perform public._notify_org_admins(v_op.org_id, 'opportunity_moderated', 'Opportunity closed by moderators: ' || v_op.title,
    left(btrim(p_reason), 300), '/org/' || v_op.org_id);
end;
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'WK_FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'suspended_users', (select count(*) from public.profiles where suspended_at is not null),
    'organizations_pending', (select count(*) from public.organizations where status = 'pending'),
    'organizations_verified', (select count(*) from public.organizations where status = 'verified'),
    'opportunities_published', (select count(*) from public.opportunities where status = 'published'),
    'applications_active', (select count(*) from public.applications where status in ('submitted', 'under_review', 'selected')),
    'offers_pending', (select count(*) from public.offers where status = 'pending' and expires_at > now()),
    'signups_confirmed', (select count(*) from public.signups where status = 'confirmed'),
    'complaints_open', (select count(*) from public.complaints where status in ('open', 'in_review')),
    'feedback_published', (select count(*) from public.feedback where status = 'published'),
    'verified_hours', coalesce((select sum(hours) from public.participation_records), 0)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Public statistics and directory (counts only; anonymous-safe)
-- -----------------------------------------------------------------------------
create or replace function public.platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select op.country_code, op.city
    from public.opportunities op join public.organizations o on o.id = op.org_id
    where op.status = 'published' and o.status = 'verified'
  ), orgs as (
    select o.country_code, o.city from public.organizations o where o.status = 'verified'
  )
  select jsonb_build_object(
    'volunteers', (select count(*) from public.profiles p where p.platform_role = 'volunteer' and p.suspended_at is null),
    'verified_organizations', (select count(*) from orgs),
    'active_opportunities', (select count(*) from pub),
    'completed_events', (select count(distinct pr.shift_id) from public.participation_records pr),
    'verified_hours', coalesce((select sum(pr.hours) from public.participation_records pr), 0),
    'countries', (select count(distinct c) from (select country_code as c from pub union select country_code from orgs) x where c is not null),
    'cities', (select count(distinct lower(btrim(c))) from (select city as c from pub union select city from orgs) y where nullif(btrim(c), '') is not null)
  );
$$;

create or replace function public.list_organizations(
  p_query text default null, p_country_code text default null, p_cause public.cause_category default null,
  p_org_type public.org_type default null, p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid, name text, slug text, description text, cause public.cause_category, org_type public.org_type,
  country_code text, city text, website text, logo_url text, published_opportunities bigint,
  average_rating numeric, review_count bigint, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.slug, o.description, o.cause, o.org_type, o.country_code, o.city, o.website, o.logo_url,
         (select count(*) from public.opportunities op where op.org_id = o.id and op.status = 'published'
            and (not op.is_sensitive or (select auth.uid()) is not null)),
         (select round(avg(f.rating), 1) from public.feedback f where f.org_id = o.id and f.status = 'published'),
         (select count(*) from public.feedback f where f.org_id = o.id and f.status = 'published'),
         count(*) over ()
  from public.organizations o
  where o.status = 'verified'
    and (nullif(btrim(p_query), '') is null or o.name ilike '%' || btrim(p_query) || '%' or o.description ilike '%' || btrim(p_query) || '%')
    and (p_country_code is null or o.country_code = upper(btrim(p_country_code)))
    and (p_cause is null or o.cause = p_cause)
    and (p_org_type is null or o.org_type = p_org_type)
  order by o.name
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- search_opportunities gains compensation, city, skill filters and a
-- closing-soon sort; the result now includes compensation and selection info.
drop function public.search_opportunities(text, public.cause_category, text, public.opportunity_mode, timestamptz, boolean, text, integer, integer);
create or replace function public.search_opportunities(
  p_query        text default null,
  p_cause        public.cause_category default null,
  p_country_code text default null,
  p_mode         public.opportunity_mode default null,
  p_starts_after timestamptz default null,
  p_only_open    boolean default false,
  p_sort         text default 'soonest',      -- soonest | newest | most_open | relevance | closing
  p_limit        integer default 20,
  p_offset       integer default 0,
  p_compensation public.compensation_type default null,
  p_city         text default null,
  p_skill        text default null,
  p_org_id       uuid default null
)
returns table (
  id uuid, org_id uuid, org_name text, org_slug text, title text, cause public.cause_category,
  mode public.opportunity_mode, country_code text, city text, is_sensitive boolean, published_at timestamptz,
  compensation_type public.compensation_type, compensation_details text, selection_mode public.selection_mode,
  application_deadline timestamptz, skills_wanted text[],
  next_shift_at timestamptz, upcoming_shifts bigint, open_spots bigint, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select op.id, op.org_id, o.name as org_name, o.slug as org_slug, op.title, op.cause, op.mode, op.country_code,
           op.city, op.is_sensitive, op.published_at, op.search_vector, op.compensation_type, op.compensation_details,
           op.selection_mode, op.application_deadline, op.skills_wanted
    from public.opportunities op
    join public.organizations o on o.id = op.org_id
    where op.status = 'published'
      and o.status = 'verified'
      and (not op.is_sensitive or (select auth.uid()) is not null)
      and (p_cause is null or op.cause = p_cause)
      and (p_country_code is null or op.country_code = upper(btrim(p_country_code)))
      and (p_mode is null or op.mode = p_mode)
      and (p_compensation is null or op.compensation_type = p_compensation)
      and (p_org_id is null or op.org_id = p_org_id)
      and (nullif(btrim(p_city), '') is null or op.city ilike btrim(p_city))
      and (nullif(btrim(p_skill), '') is null
           or exists (select 1 from unnest(op.skills_wanted) w(s) where lower(btrim(w.s)) = lower(btrim(p_skill))))
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
  select b.id, b.org_id, b.org_name, b.org_slug, b.title, b.cause, b.mode, b.country_code, b.city,
         b.is_sensitive, b.published_at, b.compensation_type, b.compensation_details, b.selection_mode,
         b.application_deadline, b.skills_wanted, st.next_shift_at,
         coalesce(st.upcoming_shifts, 0), coalesce(st.open_spots, 0),
         count(*) over ()
  from base b
  left join stats st on st.opportunity_id = b.id
  where (not coalesce(p_only_open, false) or coalesce(st.open_spots, 0) > 0)
    and (p_starts_after is null or st.next_shift_at is not null)
    and (p_sort <> 'closing' or b.application_deadline > now() or st.next_shift_at is not null)
  order by
    case when p_sort = 'newest' then b.published_at end desc nulls last,
    case when p_sort = 'most_open' then coalesce(st.open_spots, 0) end desc nulls last,
    case when p_sort = 'relevance' and nullif(btrim(p_query), '') is not null
         then ts_rank(b.search_vector, websearch_to_tsquery('simple', p_query)) end desc nulls last,
    case when p_sort = 'closing' then least(coalesce(b.application_deadline, 'infinity'::timestamptz),
                                            coalesce(st.next_shift_at, 'infinity'::timestamptz)) end asc nulls last,
    st.next_shift_at asc nulls last,
    b.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- create_organization gains public contact fields and private verification data.
drop function public.create_organization(text, text, public.cause_category, text, text, text);
create or replace function public.create_organization(
  p_name                text,
  p_slug                text,
  p_cause               public.cause_category,
  p_country_code        text,
  p_description         text default null,
  p_website             text default null,
  p_org_type            public.org_type default 'ngo',
  p_city                text default null,
  p_phone               text default null,
  p_official_email      text default null,
  p_address             text default null,
  p_registration_id     text default null,
  p_representative_name text default null,
  p_representative_role text default null
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
  perform public._assert_active(v_uid);
  if (select count(*) from public.organizations o
      where o.created_by = v_uid and o.status = 'pending') >= 3 then
    raise exception 'WK_TOO_MANY_PENDING_ORGS' using errcode = 'P0001';
  end if;

  begin
    insert into public.organizations (name, slug, cause, country_code, description, website, created_by,
                                      org_type, city, phone, official_email)
    values (btrim(p_name), lower(btrim(p_slug)), p_cause, upper(btrim(p_country_code)),
            nullif(btrim(p_description), ''), nullif(btrim(p_website), ''), v_uid,
            coalesce(p_org_type, 'ngo'), nullif(btrim(p_city), ''), nullif(btrim(p_phone), ''),
            nullif(lower(btrim(p_official_email)), ''))
    returning id into v_org_id;
  exception
    when unique_violation then
      raise exception 'WK_SLUG_TAKEN' using errcode = '23505';
    when check_violation or not_null_violation then
      raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = sqlerrm;
  end;

  insert into public.org_members (org_id, user_id, role, added_by)
  values (v_org_id, v_uid, 'org_admin', v_uid);

  begin
    insert into public.organization_private (org_id, address, registration_id, representative_name, representative_role)
    values (v_org_id, nullif(btrim(p_address), ''), nullif(btrim(p_registration_id), ''),
            nullif(btrim(p_representative_name), ''), nullif(btrim(p_representative_role), ''));
  exception when check_violation then
    raise exception 'WK_INVALID_INPUT' using errcode = '22023', detail = sqlerrm;
  end;

  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'org_pending', 'Organization awaiting review', btrim(p_name), '/admin'
  from public.profiles p where p.platform_role = 'platform_admin';
  return v_org_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 15. Notifications from existing workflows (triggers; no change to old RPCs)
-- -----------------------------------------------------------------------------
create or replace function public.tg_notify_org_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform public._notify_org_admins(new.id, 'org_status', 'Organization ' || new.status::text || ': ' || new.name,
      new.status_reason, '/org/' || new.id);
  end if;
  return null;
end;
$$;
create trigger organizations_notify_status after update of status on public.organizations
  for each row execute function public.tg_notify_org_status();

create or replace function public.tg_notify_signup_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'waitlisted' and new.status = 'confirmed' then
    perform public._notify(new.volunteer_id, 'waitlist_promoted', 'A seat opened up — you are confirmed', null, '/me');
  elsif new.status = 'cancelled' and old.status <> 'cancelled' and new.cancelled_by is distinct from new.volunteer_id then
    perform public._notify(new.volunteer_id, 'signup_cancelled', 'Your shift place was cancelled', new.cancel_reason, '/me');
  end if;
  return null;
end;
$$;
create trigger signups_notify_change after update of status on public.signups
  for each row execute function public.tg_notify_signup_change();

create or replace function public.tg_notify_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._notify(new.volunteer_id, 'hours_verified', new.hours || ' volunteer hours verified',
    'You can now leave feedback for this organization.', '/me/record');
  return null;
end;
$$;
create trigger participation_notify after insert on public.participation_records
  for each row execute function public.tg_notify_participation();

-- -----------------------------------------------------------------------------
-- 16. Function privileges: new internals stay private; API gets exactly these.
-- -----------------------------------------------------------------------------
revoke execute on function
  public._notify(uuid, text, text, text, text),
  public._notify_org_admins(uuid, text, text, text, text),
  public._assert_active(uuid),
  public._expire_offers(),
  public._join_shift_core(uuid, uuid, uuid, boolean),
  public.tg_offers_consistency(),
  public.tg_opportunities_selection_guard(),
  public.tg_notify_org_status(),
  public.tg_notify_signup_change(),
  public.tg_notify_participation(),
  public.join_shift(uuid, uuid),
  public.apply_to_opportunity(uuid, text),
  public.withdraw_application(uuid),
  public.review_application(uuid, text, text, text),
  public.send_offer(uuid, uuid, text),
  public.revoke_offer(uuid, text),
  public.accept_offer(uuid, uuid),
  public.decline_offer(uuid),
  public.my_applications(),
  public.org_applications(uuid, uuid, public.application_status, integer, integer),
  public.my_participation(),
  public.submit_feedback(uuid, integer, text),
  public.org_feedback(uuid, integer, integer),
  public.moderate_feedback(uuid, public.feedback_status, text),
  public.submit_complaint(text, text, uuid, uuid),
  public.respond_complaint(uuid, public.complaint_status, text),
  public.admin_set_suspension(uuid, boolean, text),
  public.admin_users(text, integer, integer),
  public.admin_moderate_opportunity(uuid, text),
  public.admin_overview(),
  public.platform_stats(),
  public.list_organizations(text, text, public.cause_category, public.org_type, integer, integer),
  public.search_opportunities(text, public.cause_category, text, public.opportunity_mode, timestamptz, boolean, text, integer, integer, public.compensation_type, text, text, uuid),
  public.create_organization(text, text, public.cause_category, text, text, text, public.org_type, text, text, text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.platform_stats() to anon, authenticated;
grant execute on function public.list_organizations(text, text, public.cause_category, public.org_type, integer, integer) to anon, authenticated;
grant execute on function public.org_feedback(uuid, integer, integer) to anon, authenticated;
grant execute on function public.search_opportunities(text, public.cause_category, text, public.opportunity_mode, timestamptz, boolean, text, integer, integer, public.compensation_type, text, text, uuid) to anon, authenticated;

grant execute on function public.join_shift(uuid, uuid)                                   to authenticated;
grant execute on function public.apply_to_opportunity(uuid, text)                         to authenticated;
grant execute on function public.withdraw_application(uuid)                               to authenticated;
grant execute on function public.review_application(uuid, text, text, text)               to authenticated;
grant execute on function public.send_offer(uuid, uuid, text)                             to authenticated;
grant execute on function public.revoke_offer(uuid, text)                                 to authenticated;
grant execute on function public.accept_offer(uuid, uuid)                                 to authenticated;
grant execute on function public.decline_offer(uuid)                                      to authenticated;
grant execute on function public.my_applications()                                        to authenticated;
grant execute on function public.org_applications(uuid, uuid, public.application_status, integer, integer) to authenticated;
grant execute on function public.my_participation()                                       to authenticated;
grant execute on function public.submit_feedback(uuid, integer, text)                     to authenticated;
grant execute on function public.moderate_feedback(uuid, public.feedback_status, text)    to authenticated;
grant execute on function public.submit_complaint(text, text, uuid, uuid)                 to authenticated;
grant execute on function public.respond_complaint(uuid, public.complaint_status, text)   to authenticated;
grant execute on function public.admin_set_suspension(uuid, boolean, text)                to authenticated;
grant execute on function public.admin_users(text, integer, integer)                      to authenticated;
grant execute on function public.admin_moderate_opportunity(uuid, text)                   to authenticated;
grant execute on function public.admin_overview()                                         to authenticated;
grant execute on function public.create_organization(text, text, public.cause_category, text, text, text, public.org_type, text, text, text, text, text, text, text) to authenticated;
