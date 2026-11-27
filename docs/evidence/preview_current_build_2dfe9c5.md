# Current-build signed-in smoke test — commit 2dfe9c5 (attempt 1)

- **Date:** 2026-11-27
- **Build:** `2dfe9c5`, Preview deployment `dpl_6mGZ81ssvnWnoQpsKTd7bYk67fbQ` (READY)
- **Browser:** the owner's Chrome via the Claude in Chrome extension (one connected browser, "Browser 1", Windows), one new tab that was closed afterwards
- **Mode:** read-only. Nothing was submitted, created or changed, no password was requested, and no sign-out was performed

## Session check

The owner reported being signed in on the Preview. In the connected Chrome, however, no app session existed for either Preview address:

| Address | Result |
|---|---|
| Stable `worldkin-roster-git-feature-applications-81ff46-eleventh-cipher.vercel.app/me` | redirected to `/signin?next=%2Fme` ("Welcome back") |
| Unique `worldkin-roster-pnw3egrjz-eleventh-cipher.vercel.app/me` | redirected to `/signin?next=%2Fme` |

**Likely cause:** the sign-in was made in another browser, another Chrome profile, or a window not connected to the extension. App sessions are stored per web address, so each Preview address needs its own sign-in. Per the stop policy, there were no further attempts.

## Results

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Volunteer workspace (`/me`, applications, calendar, record, notifications, profile) | **BLOCKED** | All 6 routes redirected to `/signin` — no session in the connected browser |
| 2 | Platform admin pages | **BLOCKED** | Same reason |
| 3 | A non-admin is refused at `/admin` | **BLOCKED** | Needs a separate ordinary volunteer session |
| 4 | Organizer limited to their own organization | **BLOCKED** | No demo organization-admin account available; no account was created |
| 5 | Logout | **BLOCKED** | Needs a session |
| — | Signed-out guard: every `/me/*` route redirects to `/signin` (with `next` kept) on the current build | **PASS** | 6/6 routes redirected; no error text, no horizontal overflow |

The last traced signed-in evidence is still `preview_signed_in_smoke_2026-11-26.md` (build `a1419e1`).

## To unblock

Sign in on **the stable Preview address** in the Chrome window that has the Claude extension (the same profile), then say "Signed in on Preview" again.

---

# Attempt 2 — signed-in, read-only (2026-11-27, same build `2dfe9c5`)

- **Session:** the owner signed in themselves (platform admin, not an organization member) in the Chrome window connected to the extension. Verified first: `/admin` loaded "Platform administration".
- **Mode:** pages were only opened and read. Nothing was approved, rejected, suspended, created, submitted or deleted. The only action was **Sign out**, at the very end, as planned.

## Platform admin — 7/7 PASS

| Route | h1 | Evidence |
|---|---|---|
| `/admin` | Platform administration | Sidebar: Overview, Organization verification, User management, Content moderation, Complaints, Feedback & reviews, Audit log; "Switch to" offers Volunteer workspace (`/me`) |
| `/admin/organizations` | Organization verification | Tabs Pending review* / Verified / Suspended / Rejected / All; pending queue empty ("Nothing to review here") |
| `/admin/users` | Users | 22 user rows; search present; **no Suspend button on platform-admin rows**; "admins cannot suspend themselves" note shown |
| `/admin/opportunities` | Content moderation | Section tabs Opportunities* / Feedback & reviews; status tabs Published* / Closed; 6 published listings |
| `/admin/complaints` | Complaints | Tabs Open* / In review / Resolved / Dismissed / All; no open complaints |
| `/admin/feedback` | Content moderation | Feedback & reviews* tab current; no feedback yet |
| `/admin/audit` | Audit log | 100 entries shown |

No error text and no horizontal overflow on any admin page.

## Volunteer workspace — 7/7 PASS

Reached through the sidebar link "Volunteer workspace", which shows "Admin console → /admin" back to the admin area.

| Route | h1 | Evidence |
|---|---|---|
| `/me` | Welcome back, <owner> | Sections: Next steps, Profile, Applications, Impact, Upcoming, Recent updates, History |
| `/me/applications` | Applications & offers | "No applications yet" (account has none) |
| `/me/calendar` | My calendar | November 2026 |
| `/me/record` | Verified experience passport | Certificates section present |
| `/me/notifications` | Notifications | Empty state (tabs appear only when there are notifications) |
| `/me/complaints` | Private complaints | Loaded |
| `/me/profile` | Profile & settings | Account card present; no full email address shown (masked) |

No error text and no horizontal overflow.

## Logout — PASS

| Step | Result |
|---|---|
| Sign out (sidebar) | Landed on `/signin?next=%2Fme%2Fprofile` ("Welcome back") |
| Then open `/me` | Redirected to `/signin?next=%2Fme` |
| Then open `/admin` | Redirected to `/signin?next=%2Fadmin` |

## Still BLOCKED

| Test | Reason |
|---|---|
| Logged-in non-admin refused at `/admin` | Needs a separate ordinary volunteer session (not available) |
| Organizer limited to their own organization | No demo organization-admin account; none created |

## Summary (current build `2dfe9c5`)

| Area | Result |
|---|---|
| Platform admin | PASS 7/7 |
| Volunteer workspace | PASS 7/7 |
| Logout and signed-out guards | PASS |
| Non-admin denial (live) | BLOCKED |
| Organization isolation (browser) | BLOCKED |
