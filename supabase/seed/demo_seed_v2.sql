-- =============================================================================
-- Worldkin Roster — Demo Seed v2 (applications platform)
-- -----------------------------------------------------------------------------
-- TARGET : worldkin-roster (ref ekkvwgohpzliwbmjnrth) ONLY. Operator session.
-- RUNS AS ONE TRANSACTION (single DO block). IDEMPOTENT: if the v2 marker
-- opportunity already exists it only prints a notice and changes nothing.
--
-- Prerequisites: migrations wk01..wk07, demo seed v1 (dhaka-food-relief,
-- green-delta-climate), demo users demo.* and load01..load06 @worldkin.test.
--
-- How it writes data: catalog rows (opportunities, shifts, private org data)
-- are inserted by the operator with created_by = a demo staff member; every
-- workflow step (apply, review, offer, accept, decline, withdraw, feedback,
-- complaint) runs through the REAL RPCs while impersonating the demo user
-- (request.jwt.claims, transaction-local). So all business rules, locks,
-- audit triggers and notifications apply exactly as in normal use.
--
-- Touches demo accounts only (@worldkin.test). Every record is labelled
-- "(Demo v2)". Cleanup: supabase/seed/demo_seed_v2_cleanup.sql.
-- =============================================================================
do $seed$
declare
  d constant text := 'worldkin.test';
  v_day   timestamptz := date_trunc('day', now());
  v_orgadmin uuid; v_coord uuid; v_vol1 uuid; v_vol2 uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid; v_l5 uuid; v_l6 uuid;
  v_org_a uuid; v_org_b uuid;
  v_opp1 uuid; v_opp2 uuid; v_opp3 uuid;
  v_s1a uuid; v_s1b uuid; v_s2 uuid; v_s3 uuid;
  v_app uuid; v_offer uuid; v_pr uuid;
  r jsonb;
begin
  if exists (select 1 from public.opportunities where title = 'Flood relief logistics coordinator (Demo v2)') then
    raise notice 'DEMO_SEED_V2_ALREADY_APPLIED — nothing changed';
    return;
  end if;

  select o.id into v_org_a from public.organizations o where o.slug = 'dhaka-food-relief';
  select o.id into v_org_b from public.organizations o where o.slug = 'green-delta-climate';
  select u.id into v_orgadmin from auth.users u where u.email = 'demo.orgadmin@' || d;
  select u.id into v_coord    from auth.users u where u.email = 'demo.coordinator@' || d;
  select u.id into v_vol1     from auth.users u where u.email = 'demo.volunteer1@' || d;
  select u.id into v_vol2     from auth.users u where u.email = 'demo.volunteer2@' || d;
  select u.id into v_l1 from auth.users u where u.email = 'load01@' || d;
  select u.id into v_l2 from auth.users u where u.email = 'load02@' || d;
  select u.id into v_l3 from auth.users u where u.email = 'load03@' || d;
  select u.id into v_l4 from auth.users u where u.email = 'load04@' || d;
  select u.id into v_l5 from auth.users u where u.email = 'load05@' || d;
  select u.id into v_l6 from auth.users u where u.email = 'load06@' || d;
  if v_org_a is null or v_org_b is null or v_orgadmin is null or v_coord is null or v_vol1 is null or v_vol2 is null
     or v_l1 is null or v_l2 is null or v_l3 is null or v_l4 is null or v_l5 is null or v_l6 is null then
    raise exception 'DEMO_SEED_V2_PREREQUISITES_MISSING' using detail = 'apply demo seed v1 and create the demo/load accounts first';
  end if;

  -- ---------------------------------------------------------------- profiles (demo accounts only)
  update public.profiles set education = 'BSc Environmental Science (Demo)', languages = '{Bengali,English}',
         interests = '{education,food security}', availability = 'Weekends', experience = 'Two seasons of flood relief packing (Demo).'
   where id = v_vol1;
  update public.profiles set full_name = 'Demo Volunteer ' || substring(u.email from '^load([0-9]+)@') || ' (Demo)',
         country_code = 'BD', city = 'Dhaka', languages = '{Bengali}', availability = 'Evenings'
    from auth.users u where u.id = profiles.id and u.id in (v_l1, v_l2, v_l3, v_l4, v_l5, v_l6)
     and profiles.full_name not like '%(Demo)';
  update public.organizations set org_type = 'ngo', city = 'Dhaka', official_email = 'contact@dhaka-food-relief.example.org'
   where id = v_org_a;
  update public.organizations set org_type = 'community_group', city = 'Khulna' where id = v_org_b;

  -- ---------------------------------------------------------------- catalog (as the organization staff)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_orgadmin, 'role', 'authenticated')::text, true);
  insert into public.organization_private (org_id, address, registration_id, representative_name, representative_role)
  values (v_org_a, 'House 12, Road 5, Dhanmondi, Dhaka (Demo address)', 'NGOAB-DEMO-0001', 'Nadia Rahman (Demo)', 'Executive Director')
  on conflict (org_id) do nothing;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city, status,
         skills_wanted, requirements, compensation_type, compensation_details, selection_mode, application_deadline, created_by)
  values (v_org_a, 'Flood relief logistics coordinator (Demo v2)',
          'Demo listing — coordinate volunteers and supplies at the flood relief warehouse: stock checks, loading schedules and team briefings.',
          'disaster_response', 'onsite', 'BD', 'Dhaka', 'published', '{logistics,coordination}',
          'Age 18+. Able to stand for long periods.', 'stipend', 'BDT 800 per shift for meals and transport (Demo)',
          'application', v_day + interval '5 days', v_coord)
  returning id into v_opp1;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp1, v_org_a, 'Warehouse morning (Demo v2)', v_day + interval '4 days 3 hours', v_day + interval '4 days 7 hours', 2, 2, v_coord)
  returning id into v_s1a;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp1, v_org_a, 'Warehouse weekend (Demo v2)', v_day + interval '6 days 3 hours', v_day + interval '6 days 7 hours', 2, 2, v_coord)
  returning id into v_s1b;

  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city, status,
         skills_wanted, compensation_type, compensation_details, selection_mode, application_deadline, created_by)
  values (v_org_a, 'Community kitchen volunteers (Demo v2)',
          'Demo listing — help cook and serve evening meals at the community kitchen. Open sign-up: join any shift with free seats.',
          'food_security', 'onsite', 'BD', 'Dhaka', 'published', '{cooking}', 'voluntary', null, 'open', null, v_coord)
  returning id into v_opp3;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp3, v_org_a, 'Evening kitchen (Demo v2)', v_day + interval '10 days 11 hours', v_day + interval '10 days 14 hours', 5, 3, v_coord)
  returning id into v_s3;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_orgadmin, 'role', 'authenticated')::text, true);
  insert into public.opportunities (org_id, title, description, cause, mode, country_code, city, status,
         skills_wanted, compensation_type, compensation_details, selection_mode, application_deadline, created_by)
  values (v_org_b, 'Climate data field researcher (Demo v2)',
          'Demo listing — part-time paid role: collect soil-salinity and rainfall readings in coastal villages and log them in a shared sheet.',
          'climate', 'hybrid', 'BD', 'Khulna', 'published', '{data collection,english}', 'paid',
          'BDT 15,000 per month, part-time, 3 months (Demo)', 'application', v_day + interval '7 days', v_orgadmin)
  returning id into v_opp2;
  insert into public.shifts (opportunity_id, org_id, title, starts_at, ends_at, capacity, waitlist_limit, created_by) values
    (v_opp2, v_org_b, 'Field orientation (Demo v2)', v_day + interval '9 days 2 hours', v_day + interval '9 days 6 hours', 1, 1, v_orgadmin)
  returning id into v_s2;

  -- ---------------------------------------------------------------- applications through the real RPCs
  -- 1) Amina (volunteer1): applied -> under review -> offer -> ACCEPTED (confirmed seat)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vol1, 'role', 'authenticated')::text, true);
  v_app := (public.apply_to_opportunity(v_opp1, 'I packed relief kits for two flood seasons and can lead a small team. (Demo)') ->> 'application_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  perform public.review_application(v_app, 'under_review', null, 'Strong logistics background — shortlist. (Demo note)');
  v_offer := (public.send_offer(v_app, v_s1a, 'Welcome aboard! Please arrive 15 minutes early. (Demo)') ->> 'offer_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vol1, 'role', 'authenticated')::text, true);
  r := public.accept_offer(v_offer, md5('demo-v2-accept-vol1')::uuid);

  -- 2) Rafiq (volunteer2): under review with a private note
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vol2, 'role', 'authenticated')::text, true);
  v_app := (public.apply_to_opportunity(v_opp1, 'Available every weekend. (Demo)') ->> 'application_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  perform public.review_application(v_app, 'under_review', null, 'Check weekend availability in a short call. (Demo note)');

  -- 3) load01: submitted (new, not yet reviewed)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l1, 'role', 'authenticated')::text, true);
  perform public.apply_to_opportunity(v_opp1, 'First time volunteering — keen to learn. (Demo)');

  -- 4) load02: rejected with a reason shared with the volunteer
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l2, 'role', 'authenticated')::text, true);
  v_app := (public.apply_to_opportunity(v_opp1, null) ->> 'application_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  perform public.review_application(v_app, 'reject', 'This role needs weekday availability. (Demo)');

  -- 5) load05: offer -> DECLINED
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l5, 'role', 'authenticated')::text, true);
  v_app := (public.apply_to_opportunity(v_opp1, 'Can help on the weekend shift. (Demo)') ->> 'application_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  v_offer := (public.send_offer(v_app, v_s1b, null) ->> 'offer_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l5, 'role', 'authenticated')::text, true);
  perform public.decline_offer(v_offer);

  -- 6) load03: paid role, offer PENDING (72-hour window, shows the offer card)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l3, 'role', 'authenticated')::text, true);
  v_app := (public.apply_to_opportunity(v_opp2, 'I have used rain gauges in a school project. (Demo)') ->> 'application_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_orgadmin, 'role', 'authenticated')::text, true);
  perform public.send_offer(v_app, v_s2, 'You are our first choice — please confirm. (Demo)');

  -- 7) load04: applied then WITHDREW
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l4, 'role', 'authenticated')::text, true);
  v_app := (public.apply_to_opportunity(v_opp2, null) ->> 'application_id')::uuid;
  perform public.withdraw_application(v_app);

  -- 8) load06: open sign-up on the community kitchen (instant confirmed seat)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_l6, 'role', 'authenticated')::text, true);
  perform public.join_shift(v_s3, md5('demo-v2-join-l6')::uuid);

  -- ---------------------------------------------------------------- feedback and complaint
  select pr.id into v_pr from public.participation_records pr
   where pr.volunteer_id = v_vol1 and pr.org_id = v_org_a order by pr.verified_at limit 1;
  if v_pr is not null and not exists (select 1 from public.feedback f where f.participation_id = v_pr) then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vol1, 'role', 'authenticated')::text, true);
    perform public.submit_feedback(v_pr, 5, 'Well organised and friendly team; clear briefing before the shift. (Demo)');
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_vol2, 'role', 'authenticated')::text, true);
  perform public.submit_complaint('Meeting point was unclear (Demo)',
    'Demo complaint — the shift location pin pointed to the wrong gate; it took 20 minutes to find the team.', v_org_a, null);

  perform set_config('request.jwt.claims', '', true);
  raise notice 'DEMO_SEED_V2_APPLIED';
end;
$seed$;
