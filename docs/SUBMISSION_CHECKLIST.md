# Worldkin Roster — Final Submission Checklist

> Deadline: **26 Nov 2026, 23:59 BDT**. Target: submit by ~22:00 BDT, code freeze 18:00.
> Mark an item only with evidence (URL opened in a private window, screenshot, or command output).

## 1. The four deliverables

| # | Deliverable | Requirement | Verified by | Status |
|---|---|---|---|---|
| 1 | **YouTube presentation** | public or unlisted; shows the problem, main workflow, A05 and A03 demonstrations, at least one meaningful edge case | open the link logged out | ☐ |
| 2 | **Public GitHub repository** | https://github.com/mdraisulislam-swe/worldkin-roster — source, dependency info, README with setup + architecture, no secrets | anonymous clone + secret scan | ☐ |
| 3 | **Working live project** | new Worldkin Vercel project; build matches the submitted commit; test access shared privately | open in a private window, smoke test | ☐ |
| 4 | **Project Documentation PDF** | `Worldkin_Roster_Documentation.pdf` compiled from the final docs (overview, PRD, architecture, security, database, testing evidence, setup, limitations) | open the PDF; contents match the live build | ☐ |

## 2. Required submission fields

| Field | Value |
|---|---|
| Project title | Worldkin Roster |
| Selected track | World Problem Solver |
| Problem statement | Volunteers cannot easily find trustworthy organizations, and organizations cannot reliably coordinate shifts or verify participation. Worldkin Roster connects volunteers with verified organizations, with capacity-safe shift sign-ups and organization-verified hours. Intended users: volunteers, organization admins and coordinators, platform administrators. |
| Advanced challenges | **A05** Concurrency & Transaction Management · **A03** Advanced Security & Access Control |
| YouTube presentation | ☐ URL |
| GitHub repository | https://github.com/mdraisulislam-swe/worldkin-roster |
| Live application | ☐ URL (Worldkin Vercel project only) |
| Documentation PDF | ☐ attached / link |

## 3. Final checks (all must pass)

- ☐ All links open for a logged-out visitor.
- ☐ Video, repository, live app and PDF describe the same final build (same commit SHA).
- ☐ Mandatory requirements M01–M08 demonstrated; A05 and A03 shown beyond the baseline.
- ☐ README contains setup, environment variable names, architecture summary, test instructions, known limitations.
- ☐ No passwords, tokens, API secret keys or `.env` files in the repo, the video or the PDF (publishable key only, which is public by design).
- ☐ Demo accounts are shared with judges privately, not in public files.
- ☐ Selected track is stated in the submission and the README.
- ☐ Isolation evidence: GitHub repo, Supabase project `ekkvwgohpzliwbmjnrth`, Vercel project and production URL all belong to Worldkin only.
- ☐ Known limitations stated (e.g. attendance records cannot be corrected in the MVP; sensitive-opportunity safeguards are not field-safety vetting).
