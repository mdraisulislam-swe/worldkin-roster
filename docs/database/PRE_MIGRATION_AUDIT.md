# Worldkin Roster — Final Pre-Migration Audit

> **Date:** 25 Nov 2026 (BDT) · **Target:** `worldkin-roster` / `ekkvwgohpzliwbmjnrth` / ap-southeast-1 / PostgreSQL 17
> **Result:** No blockers remain in the drafts. 2 defects found and fixed. **Nothing has been applied to Supabase.**

## Evidence levels used in this report

| Level | Meaning | Done? |
|---|---|---|
| L1 Parser | PostgreSQL's own parser (`libpg-query`) accepts every statement and PL/pgSQL body | ✅ 138 statements, 19 PL/pgSQL bodies |
| L2 Static review | Line-by-line reading of all 4 files for references, locks, grants, RLS | ✅ |
| L3 Real execution | Migrations applied to a throwaway **PostgreSQL 17.5** (PGlite 0.3.10, in scratchpad, not a project dependency) with a Supabase stub (`anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`, Supabase-style default privileges) | ✅ clean apply |
| L4 Behaviour | 96 scenario tests switching role + JWT claims per call | ✅ **96/96 pass** |
| L5 Live Supabase | Real platform roles/ownership, multi-connection concurrency, PostgREST | ❌ not allowed yet; scripts prepared |

**What L3/L4 cannot prove:** true parallel transactions (PGlite is single-connection), Supabase-specific ownership of `auth.users`, and PostgREST HTTP behaviour. These are covered by the post-migration checks (§6).

## 1. PASS

- **Integrity:** order wk01→wk02→wk03→wk04 is dependency-correct (types → tables → helpers/triggers → RLS/grants → RPCs + function grants). Every referenced table, column, type and function exists at the point of use (L3). `btree_gist` is installed into `extensions`; the exclusion constraint resolves the default uuid opclass without needing `search_path`.
- **All 29 functions pin `search_path = ''`** and schema-qualify objects (verified by catalog query). 19 are executable by API roles (14 RPCs + 5 RLS helpers); `_signup_result`, `_promote_waitlist`, `_is_api_request` and all trigger functions are not.
- **Grants:** API roles have no INSERT/UPDATE/DELETE on `signups`, `participation_records`, `audit_logs`, `org_members`. UPDATE is column-scoped; no client can write `platform_role`, org `status`, `capacity`, or shift `status` (L3 catalog check).
- **A05 (L4):** confirmed ≤ capacity; waitlist FIFO with positions 1..n; idempotent replay returns the same `signup_id`; duplicate join rejected; key reuse on another shift rejected; overlap rejected by the RPC **and** by the exclusion constraint on a direct operator insert; cancel promotes the waitlist head; repeat cancel is a no-op; capacity increase promotes in FIFO order; capacity below confirmed rejected; failed attendance leaves the signup unchanged (rollback proven).
- **A05 (L2 lock analysis):** every write RPC locks the **shift row first**, then signup rows → a single global lock order, so no deadlock cycle exists between RPCs. Cross-shift overlap races wait on the exclusion constraint of the *other* transaction, which never waits back (one RPC = one transaction). Counts are read after the lock under READ COMMITTED, so they include every committed competitor. `queue_seq` is assigned while the lock is held, which makes FIFO strict.
- **A03 (L4):** metadata role ignored at sign-up; self-escalation denied; cross-org read/update/insert/roster/capacity/attendance denied; volunteers see only their own signups and profile; anon cannot read signups/profiles; self-verification blocked by the RPC **and** a table CHECK; participation and audit rows are immutable even for operators (UPDATE/DELETE/TRUNCATE); coordinators cannot read the audit log; org admins see only their org's audit; a platform admin cannot verify their own org; the last org admin cannot be removed; sensitive opportunities are hidden from anon (table + search).
- **Operational (L4):** first admin bootstrap works and is audited; suspension hides content and blocks joins; deleting a user with history is blocked; a user without history is deletable.

## 2. BLOCKER items

**None remaining.**

| ID | Was | Evidence | Fix |
|---|---|---|---|
| B1 | Operator could not insert past shifts → demo history (attendance, dashboards, impact) impossible to seed | L4 test OPS2 failed with `WK_SHIFT_IN_PAST` | `_is_api_request()` helper; past-time rule now applies to API callers only (wk02) |

## 3. HIGH-RISK items

| ID | Risk | Status |
|---|---|---|
| H1 | **User enumeration:** anyone could create a pending org, become its admin, and call `add_org_member` to learn whether an email is registered (it even added the user) | **Fixed** (wk04): only *verified* orgs can add members. Residual: admins of verified orgs can still learn whether an email exists — accepted for the MVP |
| H2 | Trigger on `auth.users` depends on Supabase allowing `postgres` to create it (standard documented pattern, not testable locally) | Verify at apply (check #7); if refused → stop and report |
| H3 | Concurrency proven only by design + single-connection tests | Run `concurrency_check.mjs` on live project (C1–C3) ×3 |
| H4 | `_is_api_request()` trusts `request.jwt.claims` being set by PostgREST | Sound because clients cannot execute arbitrary SQL; documented |
| H5 | Seeds run as operator have `auth.uid() = null` → `created_by` must be given explicitly | Seed script will pass `created_by` |
| H6 | Migrations are not re-runnable (`create type/table/trigger`) | Expected for tracked migrations; recovery in §7 |

## 4. REQUIRED SQL fixes (applied to the local drafts)

Backup of the originals: scratchpad `backup-pre-audit/` (SHA-256 recorded). Diff:

```diff
# wk02_helpers_triggers.sql
+create or replace function public._is_api_request() returns boolean language sql stable set search_path = '' as $$
+  select nullif(current_setting('request.jwt.claims', true), '') is not null
+      or nullif(current_setting('request.jwt.claim.role', true), '') is not null;
+$$;
 ...tg_shifts_guard (INSERT and UPDATE branches):
-    if new.starts_at <= now() then
+    if new.starts_at <= now() and public._is_api_request() then

# wk04_rpc.sql — add_org_member
+  if not exists (select 1 from public.organizations o where o.id = p_org_id and o.status = 'verified') then
+    raise exception 'WK_ORG_NOT_VERIFIED' using errcode = 'P0001';
+  end if;
```
wk01 and wk03 are byte-identical to the backup. One failing test (ORG2) turned out to be a **test-data error** (a 1-character org name tripped the length CHECK first); the test was corrected, not the SQL.

## 5. Final migration execution order

| # | File | Apply as | Stop if |
|---|---|---|---|
| 0 | pre-check | `get_project` = `worldkin-roster` / `ekkvwgohpzliwbmjnrth` / ACTIVE_HEALTHY; `list_tables(public)` empty | any mismatch |
| 1 | `20261124194202_wk01_types_tables.sql` | `apply_migration` name `wk01_types_tables` | error |
| 2 | `20261124194253_wk02_helpers_triggers.sql` | `wk02_helpers_triggers` | error (esp. `auth.users` trigger) |
| 3 | `20261124194325_wk03_rls_grants.sql` | `wk03_rls_grants` | error |
| 4 | `20261124194532_wk04_rpc.sql` | `wk04_rpc` | error |
| 5 | `supabase/tests/post_migration_checks.sql` | `execute_sql` (read-only) | any expectation unmet |
| 6 | Supabase security + performance advisors | `get_advisors` | any ERROR-level finding |

## 6. Exact post-migration tests

1. **Structural** — `supabase/tests/post_migration_checks.sql`; expected: 8 tables all RLS; 8 policy rows / 14 policies; 19 API-executable functions (none starting with `_` or `tg_`); every function `search_path_pinned = true`; authenticated UPDATE columns exactly:
   `opportunities`(cause, city, country_code, description, is_sensitive, mode, requirements, requires_skill_match, skills_wanted, status, title) · `organizations`(cause, country_code, description, name, website) · `profiles`(bio, city, country_code, full_name, skills) · `shifts`(ends_at, starts_at, title, waitlist_limit); 18 trigger rows + 2 TRUNCATE triggers; 5 key constraints; `btree_gist` in `extensions`.
2. **Behavioural (same 96 scenarios)** — `supabase/tests/local-pglite/tests.mjs` documents every scenario and expected error code; after approval the same scenarios run against the live project through the API with real test users (M1).
3. **Concurrency (live)** — `supabase/tests/concurrency_check.mjs` (zero dependencies, refuses any URL except Worldkin):
   - C1 20 parallel joins on capacity 1 / waitlist 5 → exactly 1 confirmed, positions 1..5, 14 `WK_SHIFT_FULL`
   - C2 5 parallel calls with one idempotency key → 1 row, 1 non-replayed
   - C3 parallel joins on two overlapping shifts → exactly 1 success + `WK_SCHEDULE_CONFLICT`
   Run 3 times; record outputs in `docs/TESTING.md`.

Scenario map for the owner's list:

| Owner scenario | Test IDs |
|---|---|
| Clean database migration | apply.mjs (L3), post_migration_checks.sql |
| Successful signup | C-JOIN |
| Duplicate signup | C-DUP, C2 |
| Full shift | C1a, C1b, C1c |
| Concurrent signup | concurrency_check C1–C3 (live) |
| Cancellation and FIFO promotion | C4, C4b, C4c, C7 |
| Overlapping shifts | C3, C3b |
| Unauthorized access | S1a–c, S4a–c, S5a–b, S9, S11, S11b, S12, S-CAN, ATT3 |
| Role escalation | S2, S2c, S3, ORG7, ENUM |
| Attendance verification restrictions | S6, S6b, C8, C8b, ATT1–ATT5, S7a–b |
| Organization isolation | S4a–c, S5a–b, S16c–d, LC0 |

## 7. Rollback and recovery

- Each migration is applied separately. PostgreSQL DDL is transactional, so a file that fails inside one transaction leaves nothing behind. *Assumption to confirm at apply time:* the Supabase `apply_migration` tool runs each file atomically; if a partial apply is ever observed, stop and report.
- Recovery is **forward-only**: if a later file fails, fix it and apply it as a new migration. Never edit an applied migration.
- A full reset of this still-empty project (owner approval required; destructive) would drop, in order: trigger `on_auth_user_created` on `auth.users`; the 8 `public` tables (`cascade`); the 29 `public` functions; the 8 enum types. Append-only triggers do not block `DROP TABLE`.
- Supabase Free plan has no point-in-time recovery; before applying there is no data to lose. After demo data exists, take a `pg_dump`-style backup before any further migration.

## 8. Estimated implementation time (M1)

| Step | Estimate |
|---|---|
| Apply 4 migrations + structural checks + advisors | 20–30 min |
| Auth settings, create test/demo users, bootstrap admin | 20–30 min |
| Seed demo data (orgs, opportunities, shifts, history) | 30–45 min |
| Live behavioural + concurrency runs ×3, record evidence | 45–60 min |
| Buffer for one fix-forward migration | 30 min |
| **Total M1** | **≈ 2.5–3.5 hours** |

## 9. M1 gate addendum (25 Nov 2026)

| Check | Result | Level |
|---|---|---|
| Draft files unchanged since the audit fixes (SHA-256 recorded in the gate report) | ✅ | L2 |
| Skill/eligibility rule present in SQL (wk01 columns + CHECK, wk03 grants, wk04 `join_shift` step 3b), design (§3.4, RPC table, `WK_NOT_ELIGIBLE`, C11) and blueprint (FR-05, FR-08) | ✅ | L2 |
| New tests: C11c (skill match requires listed skills), C11d (requirements ≤ 1000), WL0a/b (waitlist_limit 0 rejects instead of waitlisting) | ✅ **96/96 pass** | L4 |
| `btree_gist` 1.7 available on `worldkin-roster` (read-only `list_extensions`; not installed yet — wk01 installs it into `extensions`) | ✅ | L5 (read-only) |
| First-admin guarded SQL: exactly 1 row for a case-insensitive email match, 0 rows for unknown email, audited with `actor_id = null` | ✅ | L4 |
| Email confirmation | Decision: **stays ON**; pre-confirmed demo accounts for judges; see DATABASE_DESIGN §8 | — |
| Concurrent capacity changes | Both calls lock the shift row; the second re-reads the committed capacity (READ COMMITTED + `FOR UPDATE` returns the latest row version) and validates against the current confirmed count. Proof under real parallelism is part of the live M1 run | L2 |

No new SQL defects were found in this gate; no migration file changed.

## 10. Two-issue security review (supersedes H1 and H4)

| Issue | Before fix (executed) | Finding | Fix | After fix (executed) |
|---|---|---|---|---|
| **User enumeration** (`add_org_member`, wk04) | verified-org admin: registered email → success + member added; unregistered → `WK_USER_NOT_FOUND` (P0002); member list grows (side channel). Coordinator / non-member / pending-org admin: identical `WK_FORBIDDEN` / `WK_ORG_NOT_VERIFIED` for both | **BLOCKER** — oracle available to any verified-org admin | replaced by consent-based invites: new `org_invites` table (wk01), audit trigger (wk02), RLS admin-only read (wk03), `invite_org_member` / `my_org_invites` / `accept_org_invite` / `revoke_org_invite` (wk04). The invite path never reads `auth.users` or `org_members` | registered and unregistered emails return the same `{status: invited}` payload; member list unchanged; median latency 3.59 ms vs 3.48 ms locally; only the confirmed-email owner can see/accept; revoked/foreign invites → `WK_INVITE_NOT_FOUND` |
| **`_is_api_request()`** (wk02, used only by `tg_shifts_guard`) | all API paths blocked (authenticated, anon, service_role, RPCs); tampering by clearing claims blocked by RLS (identity lost) — **but** clearing claims while keeping identity through the legacy `request.jwt.claim.sub` setting let a past shift through (T4) | **PASS via API** (PostgREST never lets clients run SQL); the guard keyed on a forgeable setting | primary signal is now `session_user = 'authenticator'` (PostgREST's login role; only a superuser can change `session_user`), plus API-role and claims checks | T1–T4 all blocked with `WK_SHIFT_IN_PAST`; operator session (`session_user = postgres`, no claims) can still seed past shifts |

Regression: full suite **99/99** (incl. new MEM1b, MEM2 re-invite, ENUM2 identical responses, ENUM3 no membership side channel) and `security_focus.mjs` (E1–E7, I0–I12, P1–P6, T1–T4, O1–O2) on PostgreSQL 17.5.

Cannot be proven locally: (1) that PostgREST on this Supabase project logs in as `authenticator` (documented Supabase behaviour) — checked live by tests P1/P2 returning `WK_SHIFT_IN_PAST` through the real API; (2) HTTP-level response timing on the real platform.

## 11. Applied to Supabase (M1 step a, 25 Nov 2026 ~01:45 BDT)

All four migrations were applied in order to `worldkin-roster` (`ekkvwgohpzliwbmjnrth`) without errors. Local files were renamed to the remote migration versions (`20261124194202`, `20261124194253`, `20261124194325`, `20261124194532`); their contents are byte-identical to what was applied (SHA-256 prefixes `321e136b…`, `254ba4d5…`, `14a29569…`, `cedc86cf…`). The "DRAFT — NOT APPLIED" header comments are historical and were deliberately left unchanged to preserve that identity. Post-migration checks matched every expectation (9 tables with RLS, 15 policies, 32 functions all with pinned `search_path`, 22 API-executable functions, 19+2 triggers, 5 key constraints, `btree_gist` 1.7). Advisors: no ERROR; expected WARN 0028/0029 (SECURITY DEFINER RPC design) and INFO (unindexed FKs on low-volume columns, unused indexes on empty tables).

## 12. Correction from live testing (25 Nov 2026)

§1 stated that no deadlock cycle exists between RPCs. Live A05 run 1 disproved this for one case: two parallel `join_shift` calls by the **same volunteer** for two **overlapping** shifts can deadlock inside the exclusion constraint (40P01). Data integrity was preserved (one place only). Migration `wk05` (applied 25 Nov 2026; A05 runs 4–6 all pass) adds a per-volunteer lock (`profiles … FOR NO KEY UPDATE`) as the first lock in `join_shift`; lock order becomes volunteer profile → shift → signup. See `docs/TESTING.md` §7.
