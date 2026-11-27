# Proposal: three administrative roles (`wk13_admin_roles`) — REQUIRES APPROVAL

Status: proposal only. Nothing has been applied to Supabase project `ekkvwgohpzliwbmjnrth`.

## Today (verified in code)

- `profiles.platform_role` is `volunteer | platform_admin` (wk01).
- There is a single admin capability, checked server-side by `public.is_platform_admin()`, which is referenced 29 times across RLS and RPCs.
- Privilege-escalation protection is in place:
  - `platform_role` cannot be written through the API (live test L4).
  - There is no public admin sign-up.
  - Admins cannot suspend themselves or other admins (local tests S1, S2, S6, S9).
- **Gap:** Super Admin, Verification Admin and Moderation Admin are not separate. Every admin can do everything. The HTML prototype shows the intended separation, but it is **not backed by the database yet**.

## Design (additive, keeps every existing check working)

```sql
create type public.admin_role as enum ('super_admin', 'verification_admin', 'moderation_admin');

create table public.admin_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.admin_role not null,
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.admin_roles enable row level security;
create policy admin_roles_select on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_admin_role('super_admin'));
-- No insert/update/delete grants: changes only through the RPCs below.

create or replace function public.has_admin_role(p_role public.admin_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles r where r.user_id = (select auth.uid()) and r.role = p_role)
      or exists (select 1 from public.admin_roles r where r.user_id = (select auth.uid()) and r.role = 'super_admin')
$$;

-- Backfill: every existing platform_admin becomes super_admin (no loss of access).
insert into public.admin_roles (user_id, role, granted_by)
select id, 'super_admin', id from public.profiles where platform_role = 'platform_admin';
```

**RPCs** (SECURITY DEFINER, fixed `search_path`, audited):
- `grant_admin_role(user, role)` and `revoke_admin_role(user, role)`. Super Admin only.
- A user cannot change their own roles.
- At least one Super Admin must remain.
- Every change is written to `audit_log`.

**Re-pointing checks** (each policy or RPC is reviewed individually, not done by search-and-replace):

| Capability | New check |
|---|---|
| `review_organization`, verification documents (`org-docs` read) | `has_admin_role('verification_admin')` |
| Complaints, feedback hide/publish, opportunity moderation, user suspension | `has_admin_role('moderation_admin')` |
| Admin overview, audit read | any admin role |
| Role management | `super_admin` only |

`is_platform_admin()` becomes "has any admin role", so all reads keep working during the transition.

## Tests (local PGlite first, then live)

1. Verification Admin can verify an organization but cannot hide feedback, and vice versa for Moderation Admin.
2. Nobody can grant themselves a role, and the last Super Admin cannot be removed.
3. Direct inserts into `admin_roles` are denied for every API role.
4. The backfill keeps existing admins working, verified by re-running live security L1–L18.
5. L19 (Founder is admin), which needs the Founder's own sign-in.

## Rollback

```sql
drop function if exists public.grant_admin_role(uuid, public.admin_role);
drop function if exists public.revoke_admin_role(uuid, public.admin_role);
-- restore previous is_platform_admin() body and the re-pointed policies (kept in rollback_wk13.sql)
drop function if exists public.has_admin_role(public.admin_role);
drop table if exists public.admin_roles;
drop type if exists public.admin_role;
```

## Frontend (after the migration)

- The admin sidebar filters its links by role. This pattern already exists in the prototype, in `W.ADMIN_PERMS`.
- Pages show "Access denied" when the role doesn't match.
- The backend remains the authority: the UI only hides links.
