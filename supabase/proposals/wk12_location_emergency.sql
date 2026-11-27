-- =====================================================================================================
-- PROPOSAL wk12 — volunteer area opt-in (A) and Emergency Volunteer Call (B)
-- STATUS: NOT APPLIED. Needs the owner's explicit approval before it is copied into supabase/migrations.
-- Rollback: supabase/proposals/wk12_location_emergency_rollback.sql
-- Tested locally only (PGlite 17): supabase/tests/local-pglite/wk12_proposal_tests.mjs
--
-- Privacy rules enforced here, not in the UI:
--  * opt-in is off by default; only the owner can read or change their emergency profile;
--  * coordinates are stored rounded to 0.05° (~5 km) — never an address;
--  * public map counts are per city with k-anonymity (cities with fewer than 3 opted-in volunteers are hidden);
--  * organizations never see who was notified; they see a responder's first name only after that volunteer
--    answers "I'm available" for their request.
-- =====================================================================================================

-- ---------------------------------------------------------------- A. volunteer area opt-in
create table public.emergency_profiles (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  opted_in     boolean not null default false,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  city         text check (char_length(btrim(city)) between 1 and 80),
  area_lat     numeric(6,2) check (area_lat between -90 and 90 and (area_lat * 20) = round(area_lat * 20)),
  area_lng     numeric(6,2) check (area_lng between -180 and 180 and (area_lng * 20) = round(area_lng * 20)),
  skills       text[] not null default '{}' check (cardinality(skills) <= 10),
  updated_at   timestamptz not null default now(),
  check (not opted_in or (country_code is not null and city is not null))
);
alter table public.emergency_profiles enable row level security;
create policy emergency_profiles_owner_select on public.emergency_profiles for select to authenticated using (user_id = auth.uid());
-- Writes only through upsert_emergency_profile (it rounds coordinates).
revoke all on public.emergency_profiles from anon, authenticated;
grant select on public.emergency_profiles to authenticated;

create or replace function public.upsert_emergency_profile(
  p_opted_in boolean, p_country_code text, p_city text, p_lat double precision, p_lng double precision, p_skills text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.emergency_profiles as e (user_id, opted_in, country_code, city, area_lat, area_lng, skills, updated_at)
  values (v_uid, coalesce(p_opted_in, false), upper(nullif(btrim(p_country_code), '')), nullif(btrim(p_city), ''),
          case when p_lat is null then null else round((p_lat * 20)::numeric) / 20 end,
          case when p_lng is null then null else round((p_lng * 20)::numeric) / 20 end,
          coalesce(p_skills, '{}'), now())
  on conflict (user_id) do update set opted_in = excluded.opted_in, country_code = excluded.country_code, city = excluded.city,
    area_lat = excluded.area_lat, area_lng = excluded.area_lng, skills = excluded.skills, updated_at = now();
end $$;
revoke all on function public.upsert_emergency_profile(boolean, text, text, double precision, double precision, text[]) from public, anon;
grant execute on function public.upsert_emergency_profile(boolean, text, text, double precision, double precision, text[]) to authenticated;

-- Public, aggregate-only volunteer availability for the map (k-anonymity threshold 3; suspended users excluded).
create or replace function public.emergency_area_counts(p_country_code text default null)
returns table (country_code text, city text, volunteers integer)
language sql stable security definer set search_path = '' as $$
  select e.country_code, initcap(lower(btrim(e.city))), count(*)::int
  from public.emergency_profiles e join public.profiles p on p.id = e.user_id
  where e.opted_in and p.suspended_at is null
    and (p_country_code is null or e.country_code = upper(p_country_code))
  group by 1, 2
  having count(*) >= 3
  order by 3 desc
  limit 500
$$;
grant execute on function public.emergency_area_counts(text) to anon, authenticated;

-- ---------------------------------------------------------------- B. emergency requests
create table public.emergency_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  created_by        uuid not null references public.profiles (id),
  category          text not null check (category in ('flood','fire','medical_support','blood_donation','food_shelter','search_logistics','other')),
  title             text not null check (char_length(btrim(title)) between 8 and 90),
  description       text not null check (char_length(btrim(description)) between 30 and 1200),
  country_code      text not null check (country_code ~ '^[A-Z]{2}$'),
  city              text not null check (char_length(btrim(city)) between 2 and 80),
  skills            text[] not null default '{}' check (cardinality(skills) <= 8),
  volunteers_needed integer not null check (volunteers_needed between 1 and 200),
  urgency           text not null check (urgency in ('high','medium','low')),
  contact_method    text not null check (contact_method in ('in_app','org_email','org_phone')),
  safety_notes      text not null default '' check (char_length(safety_notes) <= 600),
  status            text not null default 'open' check (status in ('open','responders_found','in_progress','resolved','cancelled')),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  closed_at         timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '72 hours')
);
create index emergency_requests_live_idx on public.emergency_requests (country_code, status, expires_at);

create table public.emergency_request_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.emergency_requests (id) on delete cascade,
  from_status text, to_status text not null, actor uuid references public.profiles (id), at timestamptz not null default now()
);

create table public.emergency_responses (
  request_id   uuid not null references public.emergency_requests (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  available    boolean not null,
  responded_at timestamptz not null default now(),
  primary key (request_id, volunteer_id)
);

alter table public.emergency_requests enable row level security;
alter table public.emergency_request_events enable row level security;
alter table public.emergency_responses enable row level security;
revoke all on public.emergency_requests, public.emergency_request_events, public.emergency_responses from anon, authenticated;
grant select on public.emergency_requests, public.emergency_request_events, public.emergency_responses to authenticated;

-- Live requests from verified organizations are visible to signed-in users; the posting organization sees all of its own.
create policy emergency_requests_select on public.emergency_requests for select to authenticated using (
  public.is_org_member(org_id) or public.is_platform_admin()
  or (status in ('open','responders_found','in_progress') and expires_at > now()
      and exists (select 1 from public.organizations o where o.id = org_id and o.status = 'verified'))
);
create policy emergency_events_select on public.emergency_request_events for select to authenticated using (
  exists (select 1 from public.emergency_requests r where r.id = request_id and (public.is_org_member(r.org_id) or public.is_platform_admin()))
);
create policy emergency_responses_select on public.emergency_responses for select to authenticated using (
  volunteer_id = auth.uid()
  or exists (select 1 from public.emergency_requests r where r.id = request_id and public.is_org_member(r.org_id))
);

create or replace function public.create_emergency_request(
  p_org_id uuid, p_category text, p_title text, p_description text, p_country_code text, p_city text, p_skills text[],
  p_volunteers_needed integer, p_urgency text, p_contact_method text, p_safety_notes text, p_expires_in_hours integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_hours integer := least(greatest(coalesce(p_expires_in_hours, 24), 1), 72);
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and suspended_at is not null) then raise exception 'account suspended' using errcode = '42501'; end if;
  if not public.is_org_member(p_org_id) then raise exception 'only members of the organization can post' using errcode = '42501'; end if;
  if not exists (select 1 from public.organizations where id = p_org_id and status = 'verified') then
    raise exception 'only verified organizations can post emergency requests' using errcode = '42501'; end if;
  -- Abuse protection: at most 3 requests per organization per 24 h and 1 per person per hour.
  perform pg_advisory_xact_lock(hashtextextended('emergency:' || p_org_id::text, 0));
  if (select count(*) from public.emergency_requests where org_id = p_org_id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate limit: 3 emergency requests per organization per 24 hours' using errcode = 'P0001'; end if;
  if exists (select 1 from public.emergency_requests where created_by = v_uid and created_at > now() - interval '1 hour') then
    raise exception 'rate limit: 1 emergency request per person per hour' using errcode = 'P0001'; end if;
  insert into public.emergency_requests (org_id, created_by, category, title, description, country_code, city, skills,
    volunteers_needed, urgency, contact_method, safety_notes, expires_at)
  values (p_org_id, v_uid, p_category, btrim(p_title), btrim(p_description), upper(btrim(p_country_code)), btrim(p_city),
    coalesce(p_skills, '{}'), p_volunteers_needed, p_urgency, p_contact_method, coalesce(btrim(p_safety_notes), ''), now() + make_interval(hours => v_hours))
  returning id into v_id;
  insert into public.emergency_request_events (request_id, from_status, to_status, actor) values (v_id, null, 'open', v_uid);
  -- Notify only opted-in, non-suspended volunteers in the same country and city (or with a matching skill), excluding the poster.
  insert into public.notifications (user_id, kind, title, body, link)
  select e.user_id, 'emergency_request', left('Urgent: ' || btrim(p_title), 160), left(btrim(p_city) || ' · ' || p_volunteers_needed || ' volunteers needed', 500), '/emergency'
  from public.emergency_profiles e join public.profiles p on p.id = e.user_id
  where e.opted_in and p.suspended_at is null and e.user_id <> v_uid
    and e.country_code = upper(btrim(p_country_code))
    and (lower(btrim(e.city)) = lower(btrim(p_city)) or e.skills && coalesce(p_skills, '{}'))
  limit 500;
  return v_id;
end $$;

create or replace function public.set_emergency_request_status(p_request_id uuid, p_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from text; v_org uuid;
begin
  select status, org_id into v_from, v_org from public.emergency_requests where id = p_request_id for update;
  if v_from is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not public.is_org_member(v_org) then raise exception 'only the posting organization can change this request' using errcode = '42501'; end if;
  if not ((v_from = 'open' and p_to in ('responders_found','in_progress','cancelled'))
       or (v_from = 'responders_found' and p_to in ('in_progress','resolved','cancelled'))
       or (v_from = 'in_progress' and p_to in ('resolved','cancelled'))) then
    raise exception 'invalid status change % -> %', v_from, p_to using errcode = 'P0001'; end if;
  update public.emergency_requests set status = p_to, closed_at = case when p_to in ('resolved','cancelled') then now() end where id = p_request_id;
  insert into public.emergency_request_events (request_id, from_status, to_status, actor) values (p_request_id, v_from, p_to, auth.uid());
end $$;

-- A volunteer answers; idempotent (one row per volunteer and request).
create or replace function public.respond_emergency_request(p_request_id uuid, p_available boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.emergency_profiles where user_id = v_uid and opted_in) then
    raise exception 'opt in to the emergency network first' using errcode = '42501'; end if;
  if not exists (select 1 from public.emergency_requests where id = p_request_id and status in ('open','responders_found','in_progress') and expires_at > now()) then
    raise exception 'this request is closed or expired' using errcode = 'P0001'; end if;
  insert into public.emergency_responses (request_id, volunteer_id, available) values (p_request_id, v_uid, p_available)
  on conflict (request_id, volunteer_id) do update set available = excluded.available, responded_at = now();
end $$;

-- Responders visible to the posting organization: first name only, and only for "available" answers.
create or replace function public.emergency_responders(p_request_id uuid)
returns table (first_name text, responded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select split_part(p.full_name, ' ', 1), r.responded_at
  from public.emergency_responses r join public.profiles p on p.id = r.volunteer_id
  join public.emergency_requests q on q.id = r.request_id
  where r.request_id = p_request_id and r.available and public.is_org_member(q.org_id)
  order by r.responded_at
$$;

revoke all on function public.create_emergency_request(uuid, text, text, text, text, text, text[], integer, text, text, text, integer) from public, anon;
revoke all on function public.set_emergency_request_status(uuid, text) from public, anon;
revoke all on function public.respond_emergency_request(uuid, boolean) from public, anon;
revoke all on function public.emergency_responders(uuid) from public, anon;
grant execute on function public.create_emergency_request(uuid, text, text, text, text, text, text[], integer, text, text, text, integer) to authenticated;
grant execute on function public.set_emergency_request_status(uuid, text) to authenticated;
grant execute on function public.respond_emergency_request(uuid, boolean) to authenticated;
grant execute on function public.emergency_responders(uuid) to authenticated;
