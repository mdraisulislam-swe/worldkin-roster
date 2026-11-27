-- =============================================================================
-- ROLLBACK of migration wk07 (storage) — DO NOT RUN unless the owner approves.
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
-- Run BEFORE rollback_wk06 if both are rolled back (wk07 calls wk06-era helpers
-- only through is_org_admin/is_org_member, which wk06 does not remove).
-- Uploaded FILES are not removed here: delete them first through the Storage
-- API/Dashboard. Buckets are removed only when empty; storage blocks direct
-- deletes unless storage.allow_delete_query is set for this transaction.
-- =============================================================================
drop policy if exists wk_avatars_insert  on storage.objects;
drop policy if exists wk_avatars_update  on storage.objects;
drop policy if exists wk_avatars_delete  on storage.objects;
drop policy if exists wk_avatars_select_own on storage.objects;
drop policy if exists wk_org_docs_insert on storage.objects;
drop policy if exists wk_org_docs_select on storage.objects;
drop function if exists public.storage_folder_writable(text);
drop function if exists public.storage_org_doc_readable(text);

select set_config('storage.allow_delete_query', 'true', true);  -- this transaction only
delete from storage.buckets b
 where b.id in ('avatars', 'org-docs')
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);
-- Afterwards delete the wk07 row from supabase_migrations.schema_migrations.
