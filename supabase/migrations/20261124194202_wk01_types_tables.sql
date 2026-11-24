-- =============================================================================
-- Worldkin Roster — Migration 01: extensions, enum types, tables, indexes
-- -----------------------------------------------------------------------------
-- STATUS : DRAFT FOR OWNER REVIEW — NOT APPLIED
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
--          Must never be applied to any other project.
-- =============================================================================

-- btree_gist lets one GiST exclusion constraint combine "same volunteer" (=)
-- with "overlapping time range" (&&). Used by signups_no_overlap (A05).
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Enum types (closed vocabularies; invalid values rejected by the database)
-- -----------------------------------------------------------------------------
create type public.platform_role as enum ('volunteer', 'platform_admin');

create type public.org_role as enum ('org_admin', 'coordinator');

create type public.org_status as enum ('pending', 'verified', 'rejected', 'suspended');

create type public.cause_category as enum (
  'humanitarian',
  'disaster_response',
  'refugee_support',
  'conflict_relief',
  'food_security',
  'health',
  'education',
  'environment',
  'climate',
  'community_development',
  'social_welfare',
  'other'
);

create type public.opportunity_mode as enum ('onsite', 'remote', 'hybrid');

create type public.opportunity_status as enum ('draft', 'published', 'closed');

create type public.shift_status as enum ('scheduled', 'cancelled');

create type public.signup_status as enum ('confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show');

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user (created by trigger, never by the client)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null check (char_length(btrim(full_name)) between 1 and 120),
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  city          text check (char_length(city) <= 80),
  bio           text check (char_length(bio) <= 1000),
  skills        text[] not null default '{}' check (cardinality(skills) <= 20),
  platform_role public.platform_role not null default 'volunteer',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- organizations: start as 'pending'; only a platform admin can verify
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  slug          text not null unique
                  check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description   text check (char_length(description) <= 2000),
  cause         public.cause_category not null,
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  website       text check (website ~* '^https?://[^\s]+$' and char_length(website) <= 300),
  status        public.org_status not null default 'pending',
  status_reason text check (char_length(status_reason) <= 500),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index organizations_status_idx on public.organizations (status);

-- -----------------------------------------------------------------------------
-- org_members: who works for which organization, and in which role
-- -----------------------------------------------------------------------------
create table public.org_members (
  org_id     uuid not null references public.organizations (id) on delete restrict,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.org_role not null,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_id_idx on public.org_members (user_id);

-- -----------------------------------------------------------------------------
-- org_invites: consent-based staff onboarding by email.
-- The inviter never learns whether an email belongs to a registered user
-- (no user-enumeration oracle); membership starts only when the owner of a
-- CONFIRMED account with that email accepts.
-- -----------------------------------------------------------------------------
create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete restrict,
  email       text not null
                check (email = lower(btrim(email)) and char_length(email) between 3 and 254
                       and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        public.org_role not null,
  invited_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.profiles (id) on delete restrict,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  constraint org_invites_single_outcome check (accepted_at is null or revoked_at is null),
  constraint org_invites_accept_consistency check ((accepted_at is null) = (accepted_by is null))
);

-- At most one open invite per organization and email.
create unique index org_invites_one_open
  on public.org_invites (org_id, email)
  where accepted_at is null and revoked_at is null;
create index org_invites_email_idx on public.org_invites (email);

-- -----------------------------------------------------------------------------
-- opportunities: a volunteering need published by a verified organization
-- -----------------------------------------------------------------------------
create table public.opportunities (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete restrict,
  title         text not null check (char_length(btrim(title)) between 3 and 140),
  description   text not null check (char_length(btrim(description)) between 10 and 5000),
  cause         public.cause_category not null,
  mode          public.opportunity_mode not null default 'onsite',
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  city          text check (char_length(city) <= 80),
  is_sensitive  boolean not null default false,  -- conflict/high-risk: hidden from anonymous visitors
  skills_wanted text[] not null default '{}' check (cardinality(skills_wanted) <= 20),
  requirements  text check (char_length(requirements) <= 1000),   -- human-readable eligibility notes
  requires_skill_match boolean not null default false,            -- enforced by join_shift
  status        public.opportunity_status not null default 'draft',
  published_at  timestamptz,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search_vector tsvector generated always as (
                  to_tsvector('simple',
                    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, ''))
                ) stored,
  constraint opportunities_id_org_key unique (id, org_id),           -- target of composite FK from shifts
  constraint opportunities_location_required check (mode = 'remote' or country_code is not null),
  constraint opportunities_skill_match_needs_skills check (not requires_skill_match or cardinality(skills_wanted) > 0)
);

create index opportunities_org_id_idx on public.opportunities (org_id);
create index opportunities_status_cause_idx on public.opportunities (status, cause);
create index opportunities_search_idx on public.opportunities using gin (search_vector);

-- -----------------------------------------------------------------------------
-- shifts: a time slot of an opportunity with a hard capacity
-- org_id is denormalized for fast RLS; the composite FK guarantees it always
-- equals the parent opportunity's org_id (no cross-organization shifts).
-- -----------------------------------------------------------------------------
create table public.shifts (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null,
  org_id           uuid not null,
  title            text check (char_length(title) <= 120),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  capacity         integer not null check (capacity between 1 and 500),
  waitlist_limit   integer not null default 10 check (waitlist_limit between 0 and 500),
  status           public.shift_status not null default 'scheduled',
  cancelled_reason text check (char_length(cancelled_reason) <= 500),
  created_by       uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint shifts_opportunity_org_fkey foreign key (opportunity_id, org_id)
    references public.opportunities (id, org_id) on delete restrict,
  constraint shifts_id_org_key unique (id, org_id),                   -- target of composite FK from signups
  constraint shifts_time_order check (ends_at > starts_at),
  constraint shifts_max_duration check (ends_at - starts_at <= interval '24 hours')
);

create index shifts_opportunity_starts_idx on public.shifts (opportunity_id, starts_at);
create index shifts_org_starts_idx on public.shifts (org_id, starts_at);

-- -----------------------------------------------------------------------------
-- signups: a volunteer's place on a shift (confirmed or waitlisted)
-- Written ONLY through RPC functions (join_shift, cancel_signup, ...).
-- -----------------------------------------------------------------------------
create table public.signups (
  id                     uuid primary key default gen_random_uuid(),
  queue_seq              bigint generated always as identity,  -- strict FIFO order for the waitlist
  shift_id               uuid not null,
  org_id                 uuid not null,
  volunteer_id           uuid not null references public.profiles (id) on delete restrict,
  status                 public.signup_status not null,
  slot                   tstzrange not null,                    -- copy of [shift.starts_at, shift.ends_at)
  idempotency_key        uuid not null,
  promoted_at            timestamptz,
  cancelled_at           timestamptz,
  cancelled_by           uuid references public.profiles (id) on delete set null,
  cancel_reason          text check (char_length(cancel_reason) <= 500),
  attendance_recorded_at timestamptz,
  attendance_recorded_by uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint signups_shift_org_fkey foreign key (shift_id, org_id)
    references public.shifts (id, org_id) on delete restrict,
  -- A retried request with the same key can never create a second signup.
  constraint signups_idempotency_key unique (volunteer_id, idempotency_key),
  constraint signups_cancel_consistency check ((status = 'cancelled') = (cancelled_at is not null)),
  -- A volunteer can never hold two overlapping active places (A05, DB-enforced).
  constraint signups_no_overlap exclude using gist (
    volunteer_id with =,
    slot with &&
  ) where (status in ('confirmed', 'waitlisted', 'attended'))
);

-- At most one active (non-cancelled) signup per volunteer per shift.
create unique index signups_one_active_per_shift
  on public.signups (shift_id, volunteer_id)
  where status <> 'cancelled';

create index signups_shift_status_seq_idx on public.signups (shift_id, status, queue_seq);
create index signups_volunteer_status_idx on public.signups (volunteer_id, status);
create index signups_org_id_idx on public.signups (org_id);

-- -----------------------------------------------------------------------------
-- participation_records: verified volunteer hours (append-only, immutable)
-- -----------------------------------------------------------------------------
create table public.participation_records (
  id           uuid primary key default gen_random_uuid(),
  signup_id    uuid not null unique references public.signups (id) on delete restrict,
  shift_id     uuid not null references public.shifts (id) on delete restrict,
  org_id       uuid not null references public.organizations (id) on delete restrict,
  volunteer_id uuid not null references public.profiles (id) on delete restrict,
  hours        numeric(5, 2) not null check (hours > 0 and hours <= 24),
  verified_by  uuid not null references public.profiles (id) on delete restrict,
  verified_at  timestamptz not null default now(),
  note         text check (char_length(note) <= 500),
  -- Nobody can verify their own participation (A03, DB-enforced).
  constraint participation_no_self_verification check (verified_by <> volunteer_id)
);

create index participation_volunteer_idx on public.participation_records (volunteer_id);
create index participation_org_idx on public.participation_records (org_id);

-- -----------------------------------------------------------------------------
-- audit_logs: append-only history written by triggers (never by clients)
-- actor_id has no FK on purpose: audit history must survive user deletion.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  org_id      uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb
);

create index audit_logs_org_time_idx on public.audit_logs (org_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
