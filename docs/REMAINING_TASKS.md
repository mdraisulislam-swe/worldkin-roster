# Remaining tasks (27 Nov 2026)

**State:** branch `feature/applications-platform`, local HEAD `0d976e7`. Six commits are local and not pushed: f30840a, 07719e9, 8e30139, ecdaa09, a93105e, 0d976e7. Remote branch is at `a1419e1`; Production at `e616aad`.

**Approval:** every item marked **(approval)** needs the owner's explicit go-ahead.

## P0 — blocks a fair judging

| # | Task | Who | Why |
|---|---|---|---|
| P0-1 | ~~Push to `feature/applications-platform`~~ **DONE** (2dfe9c5, Preview READY) | — | — |
| P0-2 | Read-only smoke pass on the new Preview: volunteer + admin (done before), and **organization pages with a demo org admin** | Owner signs in | Organization pages are still BLOCKED (no membership on the owner's account) |
| P0-3 | PR → `main`, merge, Production deploy **(approval)** | Owner | Production lacks the recovery fix and all UI work (S03 "live URL matches repository") |
| P0-4 | Add `https://worldkin-roster.vercel.app/**` to Supabase Redirect URLs | Owner (Dashboard) | Recovery links on Production |
| P0-5 | Record the video using `docs/DEMO_SCRIPT.md` | Owner | Submission requirement S01 |
| P0-6 | Make the GitHub repository public and check the README | Owner | Submission requirement S02 |

## P1 — improves the score or removes risk

| # | Task | Notes |
|---|---|---|
| P1-1 | Paste the code-only Confirm-signup template (`docs/auth/email-templates/confirm-signup.html`) | Owner Dashboard setting. Currently link-first |
| P1-2 | Non-admin denial check in a browser on Preview (volunteer opens `/admin`) | Read-only |
| P1-3 | Responsive pass on Preview at phone width with a real session | Read-only |
| P1-4 | Update `docs/TESTING.md` and `docs/REQUIREMENTS_COVERAGE.md` with 26–27 Nov evidence | Docs only |
| P1-5 | Re-compare PARTIAL screens A05, A07 side by side | UI only |
| P1-6 | L19 Founder admin check | Needs the Founder's own sign-in |

## P2 — optional or needs content or migrations

| # | Task | Blocker |
|---|---|---|
| P2-1 | About / Contact / Privacy / Terms (A12) | **BLOCKED:** content list in `docs/PROTOTYPE_COMPLETION_REPORT.md` §R6 |
| P2-2 | Organization Reports (D09) | Agree metrics; read-only aggregate RPC needs a migration plan **(approval)** |
| P2-3 | Media (wk08), certificate verification links (wk09), opportunity kinds (wk10), two-sided reviews / no-show disputes (wk11), map + emergency network (wk12), admin roles + MFA (wk13) | Each needs a migration **(approval)** |
| P2-4 | Footer "Report a concern" goes to a sign-in page; bottom tab label truncation at 375 px | Cosmetic |
| P2-5 | Leaked-password protection | Dashboard setting (may need a paid plan) |
| P2-6 | Self-host fonts and photos | Third-party loads are fine for the demo |
