-- =============================================================================
-- Worldkin Roster — demo seed data (M1 step e)
-- -----------------------------------------------------------------------------
-- TARGET : worldkin-roster (ref ekkvwgohpzliwbmjnrth) ONLY. Operator session.
-- RUNS AS ONE TRANSACTION (single DO block): either everything is inserted or
-- nothing is. Refuses to run twice (guard on the seed organization slug).
--
-- Prerequisites:
--   * migrations wk01..wk04 applied
--   * demo users created (create_test_users.mjs):
--       demo.orgadmin, demo.coordinator, demo.volunteer1, demo.volunteer2 @worldkin.test
--   * at least one platform admin exists (used as the reviewer of verified orgs)
--
-- Honesty notes:
--   * Seed rows are written by the operator, so audit_logs record actor_id = null.
--   * Org memberships are inserted directly (the consent-based invite flow is
--     for real onboarding; demo accounts are owner-controlled).
--   * Historical shifts/attendance are inserted directly so dashboards and
--     impact pages have data; verified_by is always a staff member different
--     from the volunteer (the table CHECK enforces this).
--   * No personal email addresses appear in this file.
--   * Every seeded organization, opportunity, shift and demo profile is labelled
--     "(Demo)" / "Demo …" so it can never be mistaken for real data.
-- =============================================================================
do $seed$
declare
  d constant text := 'worldkin.test';
  v_admin     uuid;
  v_orgadmin  uuid;
  v_coord     uuid;
  v_vol1      uuid;
  v_vol2      uuid;
  v_org_a     uuid;
  v_org_b     uuid;
  v_org_c     uuid;
  v_opp       uuid;
  v_shift     uuid;
  v_signup    uuid;
  v_day       timestamptz := date_trunc('day', now());   -- 00:00 UTC = 06:00 BDT
begin
  if exists (select 1 from public.organizations where slug = 'dhaka-food-relief') then
    raise exception 'SEED_ALREADY_APPLIED';
  end if;

  select p.id into v_admin from public.profiles p
   where p.platform_role = 'platform_admin' order by p.created_at limit 1;
  select u.id into v_orgadmin from auth.users u where u.email = 'demo.orgadmin@' || d;
  select u.id into v_coord    from auth.users u where u.email = 'demo.coordinator@' || d;
  select u.id into v_vol1     from auth.users u where u.email = 'demo.volunteer1@' || d;
  select u.id into v_vol2     from auth.users u where u.email = 'demo.volunteer2@' || d;
  if v_admin is null or v_orgadmin is null or v_coord is null or v_vol1 is null or v_vol2 is null then
    raise exception 'SEED_PREREQUISITES_MISSING'
      using detail = format('admin=%s orgadmin=%s coord=%s vol1=%s vol2=%s',
                            v_admin is not null, v_orgadmin is not null, v_coord is not null,
                            v_vol1 is not null, v_vol2 is not null);
  end if;

  -- Profiles (display names / skills for a realistic demo)
  update public.profiles set full_name = 'Nadia Rahman (Demo)', country_code = 'BD', city = 'Dhaka',
         skills = '{logistics,coordination}' where id = v_orgadmin;
  update public.profiles set full_name = 'Tanvir Hasan (Demo)', country_code = 'BD', city = 'Dhaka',
         skills = '{first aid,logistics}' where id = v_coord;
  update public.profiles set full_name = 'Amina Chowdhury (Demo)', country_code = 'BD', city = 'Dhaka',
         skills = '{english,bengali,teaching}', bio = 'University student volunteering on weekends.' where id = v_vol1;
  update public.profiles set full_name = 'Rafiq Ahmed (Demo)', country_code = 'BD', city = 'Chattogram',
         skills = '{packing}' where id = v_vol2;

  -- Organizations: two verified, one pending (for the admin review demo)
  insert into public.organizations (name, slug, description, cause, country_code, website, status,
                                    reviewed_by, reviewed_at, created_by)
  values ('Dhaka Food Relief Network (Demo)', 'dhaka-food-relief',
          'Demo organization — community kitchens and food parcel distribution for low-income families in Dhaka.',
          'food_security', 'BD', 'https://example.org/dhaka-food-relief', 'verified', v_admin, now(), v_orgadmin)
  returning id into v_org_a;

  insert into public.organizations (name, slug, description, cause, country_code, status,
                                    reviewed_by, reviewed_at, created_by)
  values ('Green Delta Climate Action (Demo)', 'green-delta-climate',
          'Demo organization — mangrove restoration and climate literacy across the Bengal delta.',
          'climate', 'BD', 'verified', v_admin, now(), v_orgadmin)
  returning id into v_org_b;

  insert into public.organizations (name, slug, description, cause, country_code, status, created_by)
  values ('Coastal Cleanup Collective (Demo)', 'coastal-cleanup',
          'Demo organization — monthly beach and river-bank cleanups along the Bay of Bengal.',
          'environment', 'BD', 'pending', v_vol2)
  returning id into v_org_c;

  insert into public.org_members (org_id, user_id, role, added_by) values
    (v_org_a, v_orgadmin, 'org_admin',   v_orgadmin),
    (v_org_a, v_coord,    'coordinator', v_orgadmin),
    (v_org_b, v_orgadmin, 'org_admin',   v_orgadmin),
    (v_org_c, v_vol2,     'org_admin',   v_vol2);

  -- ---------------------------------------------------------------- Org A
  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city,
                                    skills_wanted, status, created_by)
  values (v_org_a, 'Weekend food parcel packing (Demo)',
          'Demo listing — pack dry-food parcels for 300 families. Training on arrival, gloves provided.',
          'food_security', 'onsite', 'BD', 'Dhaka', '{packing,logistics}', 'published', v_coord)
  returning id into v_opp;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp, v_org_a, 'Saturday morning (Demo)', v_day + interval '2 days 3 hours', v_day + interval '2 days 7 hours', 8, 5, v_coord),
    (v_opp, v_org_a, 'Next Saturday (Demo)',    v_day + interval '9 days 3 hours', v_day + interval '9 days 7 hours', 8, 5, v_coord);
  -- history: past shift with attendance
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, created_by)
  values (v_opp, v_org_a, 'Last Saturday (Demo)', v_day - interval '3 days' + interval '3 hours',
          v_day - interval '3 days' + interval '7 hours', 8, v_coord)
  returning id into v_shift;
  insert into public.signups (shift_id, org_id, volunteer_id, status, slot, idempotency_key,
                              attendance_recorded_at, attendance_recorded_by)
  values (v_shift, v_org_a, v_vol1, 'attended',
          tstzrange(v_day - interval '3 days' + interval '3 hours', v_day - interval '3 days' + interval '7 hours', '[)'),
          gen_random_uuid(), now(), v_coord)
  returning id into v_signup;
  insert into public.participation_records (signup_id, shift_id, org_id, volunteer_id, hours, verified_by, note)
  values (v_signup, v_shift, v_org_a, v_vol1, 4, v_coord, 'Demo record — packed and labelled 60 parcels.');
  insert into public.signups (shift_id, org_id, volunteer_id, status, slot, idempotency_key,
                              attendance_recorded_at, attendance_recorded_by)
  values (v_shift, v_org_a, v_vol2, 'no_show',
          tstzrange(v_day - interval '3 days' + interval '3 hours', v_day - interval '3 days' + interval '7 hours', '[)'),
          gen_random_uuid(), now(), v_coord);

  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city,
                                    skills_wanted, requires_skill_match, requirements, status, created_by)
  values (v_org_a, 'Flood relief distribution support (Demo)',
          'Demo listing — help distribute emergency kits in flood-affected unions. Small teams, coordinator-led.',
          'disaster_response', 'onsite', 'BD', 'Sylhet', '{first aid,logistics}', true,
          'Must list first aid or logistics as a skill. Minimum age 18. Sturdy footwear required.',
          'published', v_coord)
  returning id into v_opp;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp, v_org_a, 'Distribution team (Demo, 1 seat)', v_day + interval '3 days 4 hours', v_day + interval '3 days 8 hours', 1, 3, v_coord);

  insert into public.opportunities (org_id, title, description, cause, mode, skills_wanted, status, created_by)
  values (v_org_a, 'Remote hotline interpreters (Demo)',
          'Demo listing — interpret calls between displaced families and aid caseworkers, from home.',
          'refugee_support', 'remote', '{bengali,english}', 'published', v_coord)
  returning id into v_opp;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp, v_org_a, 'Evening hotline (Demo)', v_day + interval '1 day 13 hours', v_day + interval '1 day 15 hours', 5, 2, v_coord);

  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city, status, created_by)
  values (v_org_a, 'Ramadan iftar distribution (Demo draft)',
          'Demo draft listing — not visible to the public until published.',
          'food_security', 'onsite', 'BD', 'Dhaka', 'draft', v_coord);

  -- ---------------------------------------------------------------- Org B
  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city, status, created_by)
  values (v_org_b, 'Mangrove planting day (Demo)',
          'Demo listing — plant mangrove saplings with local communities to protect the coastline.',
          'climate', 'onsite', 'BD', 'Khulna', 'published', v_orgadmin)
  returning id into v_opp;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp, v_org_b, 'Planting team (Demo)', v_day + interval '5 days 2 hours', v_day + interval '5 days 8 hours', 20, 10, v_orgadmin);
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, created_by)
  values (v_opp, v_org_b, 'Previous planting (Demo)', v_day - interval '5 days' + interval '2 hours',
          v_day - interval '5 days' + interval '5 hours', 20, v_orgadmin)
  returning id into v_shift;
  insert into public.signups (shift_id, org_id, volunteer_id, status, slot, idempotency_key,
                              attendance_recorded_at, attendance_recorded_by)
  values (v_shift, v_org_b, v_vol1, 'attended',
          tstzrange(v_day - interval '5 days' + interval '2 hours', v_day - interval '5 days' + interval '5 hours', '[)'),
          gen_random_uuid(), now(), v_orgadmin)
  returning id into v_signup;
  insert into public.participation_records (signup_id, shift_id, org_id, volunteer_id, hours, verified_by)
  values (v_signup, v_shift, v_org_b, v_vol1, 3, v_orgadmin);

  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city, status, created_by)
  values (v_org_b, 'Climate literacy workshop facilitators (Demo)',
          'Demo listing — co-facilitate a 2-hour climate literacy session for secondary-school students.',
          'education', 'hybrid', 'BD', 'Dhaka', 'published', v_orgadmin)
  returning id into v_opp;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp, v_org_b, 'School session (Demo)', v_day + interval '4 days 4 hours', v_day + interval '4 days 6 hours', 2, 2, v_orgadmin);

  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city,
                                    is_sensitive, requirements, status, created_by)
  values (v_org_b, 'Support for displaced families (Demo, sensitive)',
          'Demo listing — logistics support at a community centre for recently displaced families.',
          'conflict_relief', 'onsite', 'BD', 'Cox''s Bazar', true,
          'Visible only to signed-in users. Exact meeting point shared after confirmation by the coordinator.',
          'published', v_orgadmin)
  returning id into v_opp;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp, v_org_b, 'Day shift (Demo)', v_day + interval '6 days 3 hours', v_day + interval '6 days 9 hours', 4, 2, v_orgadmin);

  raise notice 'SEED_OK orgs=% % %', v_org_a, v_org_b, v_org_c;
end
$seed$;
