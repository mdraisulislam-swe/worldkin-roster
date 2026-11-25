-- =============================================================================
-- Worldkin Roster — Migration 07: file storage for avatars/logos and private
-- organization verification documents.
-- TARGET : Supabase project "worldkin-roster" (ref ekkvwgohpzliwbmjnrth) ONLY.
-- Folder convention: avatars/<user id>/… (profile photo) or avatars/<org id>/…
-- (logo, org admins only); org-docs/<org id>/… (private).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  true,  2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('org-docs', 'org-docs', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- True when the first folder of an object path belongs to the caller: their own
-- user id, or an organization they administer. Never errors on odd input.
create or replace function public.storage_folder_writable(p_folder text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_folder is null then
    return false;
  end if;
  if p_folder = auth.uid()::text then
    return true;
  end if;
  if p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_org_admin(p_folder::uuid);
  end if;
  return false;
end;
$$;

create or replace function public.storage_org_doc_readable(p_folder text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_folder is null or p_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_org_member(p_folder::uuid) or public.is_platform_admin();
end;
$$;

revoke execute on function public.storage_folder_writable(text), public.storage_org_doc_readable(text) from public, anon;
grant execute on function public.storage_folder_writable(text), public.storage_org_doc_readable(text) to authenticated;

-- avatars: public read (bucket is public); write only into one's own folder.
create policy wk_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.storage_folder_writable((storage.foldername(name))[1]));
create policy wk_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.storage_folder_writable((storage.foldername(name))[1]))
  with check (bucket_id = 'avatars' and public.storage_folder_writable((storage.foldername(name))[1]));
create policy wk_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.storage_folder_writable((storage.foldername(name))[1]));

-- org-docs: private. Org admins upload into their organization's folder;
-- members of that organization and platform admins can read. No deletes
-- (verification evidence is kept).
create policy wk_org_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-docs' and (storage.foldername(name))[1] <> auth.uid()::text
              and public.storage_folder_writable((storage.foldername(name))[1]));
create policy wk_org_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'org-docs' and public.storage_org_doc_readable((storage.foldername(name))[1]));
