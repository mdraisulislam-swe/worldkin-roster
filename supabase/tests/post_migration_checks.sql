-- =============================================================================
-- Worldkin Roster — post-migration structural checks (READ-ONLY)
-- Run against: worldkin-roster (ref ekkvwgohpzliwbmjnrth) ONLY, right after
-- migrations wk01..wk04 are applied. Every query returns rows that make the
-- expected state explicit; "expected" comments give the passing values.
-- =============================================================================

-- 1. Tables and RLS  (expected: 9 rows, rls_enabled = true for all)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2. Policies per table  (expected: 9 rows, 15 policies total)
select tablename, count(*) as policies, string_agg(policyname, ', ' order by policyname) as names
from pg_policies where schemaname = 'public'
group by tablename order by tablename;

-- 3. Table privileges of API roles  (expected: only the grants listed in wk03;
--    NO insert/update/delete on signups, participation_records, audit_logs, org_members, org_invites)
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name order by table_name, grantee;

-- 4. Column-level UPDATE grants  (expected: no platform_role, status, capacity, reviewed_*)
select grantee, table_name, string_agg(column_name, ', ' order by column_name) as updatable_columns
from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
group by grantee, table_name order by table_name;

-- 5. Functions: SECURITY DEFINER and pinned search_path
--    (expected: every row has search_path_pinned = true)
select p.proname, p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%' as search_path_pinned
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;

-- 6. Which functions API roles may EXECUTE
--    (expected: 22 rows = 17 RPCs + 5 RLS helpers; _signup_result, _promote_waitlist,
--     _is_api_request and all tg_* are NOT listed)
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
order by 1;

-- 7. Triggers  (expected: 19 rows here, incl. on_auth_user_created on auth.users,
--    plus the 2 TRUNCATE triggers listed by the next query = 21 user triggers)
select event_object_schema as schema, event_object_table as table_name, trigger_name,
       string_agg(event_manipulation, '/' order by event_manipulation) as events, action_timing
from information_schema.triggers
where event_object_schema in ('public', 'auth')
group by 1, 2, 3, 5 order by 1, 2, 3;
-- note: TRUNCATE triggers are not shown by information_schema; check pg_trigger:
select tgrelid::regclass as table_name, tgname from pg_trigger
where not tgisinternal and tgname like '%truncate%';

-- 8. Key constraints exist  (expected: 5 rows)
select conrelid::regclass as table_name, conname, contype
from pg_constraint
where conname in ('signups_no_overlap', 'signups_idempotency_key', 'participation_no_self_verification',
                  'shifts_opportunity_org_fkey', 'signups_shift_org_fkey')
order by 1, 2;

-- 9. Extension  (expected: btree_gist in schema extensions)
select extname, extnamespace::regnamespace as schema, extversion from pg_extension where extname = 'btree_gist';
