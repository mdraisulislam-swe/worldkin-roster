-- Rollback for PROPOSAL wk12 (not applied). Removes only the objects the proposal creates.
drop function if exists public.emergency_responders(uuid);
drop function if exists public.respond_emergency_request(uuid, boolean);
drop function if exists public.set_emergency_request_status(uuid, text);
drop function if exists public.create_emergency_request(uuid, text, text, text, text, text, text[], integer, text, text, text, integer);
drop function if exists public.emergency_area_counts(text);
drop function if exists public.upsert_emergency_profile(boolean, text, text, double precision, double precision, text[]);
drop table if exists public.emergency_responses;
drop table if exists public.emergency_request_events;
drop table if exists public.emergency_requests;
drop table if exists public.emergency_profiles;
delete from public.notifications where kind = 'emergency_request';
