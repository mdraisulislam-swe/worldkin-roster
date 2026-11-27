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
