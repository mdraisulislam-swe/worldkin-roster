# Demo script (YouTube, about 6–8 minutes)

**Record on:** the Production URL **after** the branch is merged. If it is not merged yet, record on the stable Preview URL and say so on screen.

## Rules for the recording

- **Accounts:** use only demo accounts and demo data (names end in "(Demo)"). Never show a password, an email inbox, the Supabase dashboard keys or `.env` files.
- **No sign-ups:** do not sign up new accounts during the recording. The built-in mailer has rate limits.
- **Shared database:** Preview and Production use the same database, so any action creates real demo rows. Prefer viewing over creating.

## 1. Problem and users (≈ 45 s)

- **Problem:** volunteers can't tell which organizations are real, organizations overbook shifts, and nobody keeps a trustworthy record of hours.
- **Users:** volunteers, verified organizations (NGOs, clubs, community groups) and platform administrators.
- **Track:** World Problem Solver. **Declared challenges:** A03 and A05.

## 2. Public side (≈ 1 min)

1. **Home:** live counts come from the database (`platform_stats`). Point out "Every organization is verified".
2. **Explore:**
   - search a word;
   - pick the cause and compensation chips;
   - clear;
   - press Back to show that filters live in the URL.
3. **Organizations:** show that only verified organizations are listed. Open one organization profile.
4. **Opportunity detail:** compensation badge (voluntary / stipend / paid), shifts with seats left and the waitlist.

## 3. Volunteer workflow (≈ 1.5 min)

1. **Sign in:** use the Volunteer tab.
2. **`/me`:** the next shift, application counts and verified hours.
3. **Apply:** apply to a selection-mode opportunity, or show an existing application in **Applications**.
4. **Offer:** accept an offer. It is an atomic booking and the seat appears in **Calendar**.
5. **Record:** show verified hours and certificates. Hours count only after the organization confirms attendance.

## 4. Organization workflow (≈ 1.5 min)

1. **Sign in:** use the Organization tab.
2. **Overview:** open the dashboard.
3. **Create opportunity:** the three section cards and the **live preview**. Save as a draft (no publish needed).
4. **Applicants:** open the table and the Review panel, then send an offer.
5. **Shift page:** capacity, roster, **Present / No-show**. Each record is final and audit-logged.

## 5. Admin (≈ 45 s)

- **Verification queue:** private documents are visible only to admins.
- **Users:** admins cannot suspend other admins.
- **Content moderation tabs, Complaints and the Audit log:** the earlier actions appear in the audit log.

## 6. A05 — last seat (≈ 1 min) — required edge case

1. **Setup:** show a demo shift with exactly one seat left.
2. **Race:** run `node supabase/tests/concurrency_check.mjs` (or replay `docs/evidence/live_wk06/a05_run*.txt` on screen if you prefer not to write).
3. **Result:** two requests for the final seat → **1 confirmed + 1 waitlisted**, never overbooked.
4. **How it works:** a row lock in `_join_shift_core`, a capacity check inside the transaction, and an idempotency key (a repeated accept creates one sign-up).

## 7. A03 — modifying another user's record (≈ 1 min) — required edge case

1. **Show** `docs/evidence/live_wk06/security.txt` (L1–L18 PASS).
2. **Explain the key case:** user A tries to update user B's application or another organization's opportunity. Row-level security denies it, and direct table writes are blocked (S1–S4).
3. **In the UI:** a volunteer opening `/admin` sees "No access", and a bad organization id shows "Organization not available".

## 8. Limitations and close (≈ 30 s)

- **Not built yet:** media, map, emergency network, admin MFA, reports and the About/legal pages (content needed).
- **Links:** repository, live URL and the two challenge IDs.
