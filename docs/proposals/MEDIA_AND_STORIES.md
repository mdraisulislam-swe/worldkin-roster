# Proposal: Media & Stories (`/media`) — REQUIRES APPROVAL

Status: **proposal only.** Nothing here is applied. Applying it needs the owner's explicit approval, because Preview and Production share Supabase project `ekkvwgohpzliwbmjnrth`.

## Why a migration is needed

The two existing buckets cannot be used for galleries:
- `avatars` (public, 2 MB, png/jpeg/webp) holds profile photos and organization logos. Writes are limited to a user's own folder or to organization admins (`storage_folder_writable`).
- `org-docs` (private, 5 MB) holds verification documents and must stay private.

There is no table for captions, events, consent or moderation status. A `/media` page today would therefore be empty or fake, so it has **not** been built.

## Proposed migration `wk08_org_media` (additive)

```sql
-- Bucket: public read, but objects are only listed through approved rows (below).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-media', 'org-media', true, 3145728, array['image/jpeg','image/png','image/webp']);

create type public.media_status as enum ('pending', 'published', 'hidden');

create table public.org_media (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid,                         -- optional link to an event
  storage_path   text not null unique,         -- '<org_id>/<uuid>.<ext>'
  caption        text not null check (char_length(btrim(caption)) between 3 and 300),
  taken_on       date,
  consent_confirmed boolean not null default false,  -- uploader confirms people shown consented
  status         public.media_status not null default 'pending',
  moderation_reason text,
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  foreign key (opportunity_id, org_id) references public.opportunities(id, org_id),
  check (storage_path like org_id::text || '/%'),
  check (status <> 'published' or consent_confirmed)
);
create index org_media_public_idx on public.org_media (status, created_at desc);
alter table public.org_media enable row level security;

-- Read: anyone sees published media of verified organizations; staff also see their own org's items.
create policy org_media_select on public.org_media for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.organizations o where o.id = org_id and o.status = 'verified'))
         or public.is_org_member(org_id) or public.is_platform_admin());

-- Write: org admins of their own organization only (coordinators: read-only, matching the team/settings model).
create policy org_media_insert on public.org_media for insert to authenticated
  with check (public.is_org_admin(org_id) and created_by = (select auth.uid()) and status = 'pending');
create policy org_media_update on public.org_media for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id) and status <> 'published');
-- (publishing happens only in the review_media RPC below, never through this policy)
create policy org_media_delete on public.org_media for delete to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin());

-- Storage: write only inside your organization's folder (org admins); read is public by URL.
create policy org_media_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-media' and public.is_org_admin(((storage.foldername(name))[1])::uuid));
create policy org_media_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-media' and (public.is_org_admin(((storage.foldername(name))[1])::uuid) or public.is_platform_admin()));
```

**Publishing:**
- Only platform admins move items to `published`, through a `review_media(id, status, reason)` SECURITY DEFINER RPC with a fixed `search_path`.
- Each decision is written to the audit log.
- Organization admins cannot self-publish: the insert is forced to `pending`.

## Security implications

- **Public bucket.** Anyone holding the exact URL of a pending or hidden image can view it. Paths are random UUIDs and are never listed for anonymous users, but this is not access control. If that is unacceptable, use a private bucket with signed URLs (more work).
- **Data minimisation.** No volunteer personal data is stored: captions are free text, and the upload form warns not to include names without consent.
- **EXIF.** Location metadata in photos must be stripped before upload (client-side canvas re-encode). This is listed as a requirement in the UI work.
- **Coordinators.** Coordinators get read-only access, matching the existing team and settings model.

## Test plan (local PGlite first, then a live read-only check)

1. Anonymous sees only published media of verified organizations; pending and hidden items are not listed.
2. An org A admin cannot insert, update or delete an org B row or object (folder check and RLS).
3. A coordinator cannot insert.
4. An org admin cannot set `status = 'published'`.
5. Publishing without `consent_confirmed` fails the CHECK.
6. Wrong MIME type or a file over 3 MB is rejected by the bucket.
7. Platform admin publish and hide is audited.

## Rollback (`rollback_wk08.sql`)

```sql
drop policy if exists org_media_obj_insert on storage.objects;
drop policy if exists org_media_obj_delete on storage.objects;
drop table if exists public.org_media;
drop type if exists public.media_status;
delete from storage.objects where bucket_id = 'org-media';
delete from storage.buckets where id = 'org-media';
```

## UI after approval (about 3–4 hours including tests)

- `/media`: a responsive gallery with filters (organization, event, cause, date), an accessible lightbox (focus trap, Esc, captions, alt text from the caption), and empty and loading states.
- Organization admin "Media" tab: upload (type and size checked before upload, EXIF stripped), caption, consent checkbox, pending status.
- Admin moderation queue.
- Navigation: "Media & Stories" in the public nav and footer, shown only after there is published content.
- **Video:** link-only (YouTube or Vimeo URL field) is recommended over hosting video files, because of storage cost and moderation.
