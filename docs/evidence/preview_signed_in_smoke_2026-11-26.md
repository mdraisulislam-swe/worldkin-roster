# Preview signed-in smoke test — volunteer and admin (read-only)

- **When:** 2026-11-26 20:10 UTC (27 Nov 02:10 BDT)
- **Where:** stable Preview alias `worldkin-roster-git-feature-applications-81ff46-eleventh-cipher.vercel.app`
- **Build under test:** commit **`a1419e1`**, deployment `dpl_G11u1pSVgEacrxRAhoU6Va4pFkHZ` (READY 19:45 UTC). This is the latest `feature/applications-platform` deployment at test time; the 20:06 deployment belongs to branch `prototype-reference`.
- **Session:** the owner's own account (platform admin, not an organization member), signed in by the owner in Chrome. Nothing was submitted, created, changed or emailed.
- **Source:** copied verbatim from the Claude Code session report (transcript `02ba4e50…`, entry at 2026-11-26T20:10:13Z). The owner's first name is redacted.
- **Scope note:** this predates R1–R5 and the map release (`2dfe9c5`). It proves the volunteer and admin modules on `a1419e1`, not the current UI. D1–D3 were fixed in `07719e9`.

---

Every volunteer and admin page works on the Preview with your real account. I found one P1 navigation gap and two minor error-page defects. The organization pages and the "ordinary users are kept out" check couldn't be run with this account. Nothing was submitted, created, changed or emailed, and no reset was requested.

**Session check.** The connected Chrome is signed in on the **stable Preview**: `/me` shows "Welcome back, <owner>." in the workspace layout, with no public header. Your profile page confirms the account is a **platform admin**.

## Volunteer pages: all PASS

All seven show no error messages, no failed requests and no sideways scrolling at 1440 px.

| Route | Evidence |
|---|---|
| `/me` | Workspace layout; Next steps (Edit profile, Explore); Profile card at 50%; 4 stat tiles with real zeros (new volunteer); Upcoming, Recent updates and History sections |
| `/me/applications` | "No applications yet". Tabs and table appear only once there are applications, so they couldn't be seen with this account |
| `/me/calendar` | November 2026 month view plus Today |
| `/me/record` (passport) | 4 tiles, Print button, chart / skills / verified sessions. No certificate links, because there are no verified hours |
| `/me/notifications` | "No notifications yet" |
| `/me/complaints` | Form plus "Your complaints" (nothing submitted) |
| `/me/profile` | 12 fields shown (not edited); role shown as "platform admin" |

## Admin pages: all PASS, with real data

All seven show the dark-green sidebar with the right item marked current, no errors and no failed requests.

| Route | Evidence |
|---|---|
| `/admin` | 4 tiles (22 users, 0 pending verifications with 3 verified, 0 open complaints, 6 published opportunities with 12 active applications), Your queue (empty), Platform activity, 5 recent audit entries |
| `/admin/organizations` | Status filter; "Nothing to review here" |
| `/admin/users` | Table with 22 rows: User, Location, Activity, Status, Actions |
| `/admin/opportunities` | 6 opportunities, each with Close (not clicked) |
| `/admin/complaints`, `/admin/feedback` | Empty states |
| `/admin/audit` | 100 rows; the old tab row is gone |

## Other checks

| Check | Result |
|---|---|
| Organization pages (`/org/...`) | **BLOCKED**: `/orgs` says your account isn't in any organization |
| Ordinary user refused from admin and organization pages | **BLOCKED** live, since only an admin session is available. The rule itself has unit tests and earlier live security checks L6/L10, and signed-out redirects were checked on 27 Nov |
| Tablet and phone layouts, slide-out menu with your real session | **BLOCKED**: Chrome is maximized and wouldn't resize, so the page stayed 1920 px wide. The earlier sample-data layout tests and unit tests stand. The window size is restored |
| Browser console | **PASS**: no errors |
| Failed network requests | **PASS**: none on any route |

## Defects (none fixed)

| ID | Priority | Route | Defect | Smallest fix |
|---|---|---|---|---|
| D1 | **P1** | `/me` and all workspace pages | **No way to get from the workspace to Admin or My organizations.** The workspace layout hides the public header, which held those links, so an admin has to go via the logo → home → Admin. That's awkward during a demo. | Add "Admin" (platform admins only) and "My organizations" (members only) links to the sidebar footer in `WorkspaceLayout.tsx` |
| D2 | P2 | `/org/not-a-uuid/team` | Shows the raw database error `invalid input syntax for type uuid`. Only a platform admin with a malformed URL can reach it; others see "No access". | Show "Page not found" for malformed organization IDs at the organization layout (`WorkspaceLayout.tsx` / guard), reusing the existing `isUuid` check |
| D3 | P2 | `/org/<non-existent id>` | "Something went wrong / Organization not found" with **no page heading** | Comes with D2: a proper not-found page with a heading |

## Remaining blockers
1. **Organization pages:** need a demo organization account. The safe route is to invite an `@worldkin.test` user to a demo organization from its Team page, without touching your account.
2. **Ordinary-user refusal:** needs a non-admin test account session.
3. **Phone and tablet layouts on the real session:** needs a resizable window. Un-maximize Chrome, or test on a phone.
4. **Production is still e616aad:** you haven't approved the merge yet, so Production still lacks password reset and all the new work.