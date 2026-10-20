# Timevera — Technical Handover

**Audience:** whoever will own and operate the Timevera (Build One / ARKO Joinery) platform after handover: the client's IT contact and any developer who maintains it.
**As at:** 17 October 2026.

---

## 1. What the system is

| Part | Technology | Where it runs |
| --- | --- | --- |
| Worker mobile app ("Timevera") | Expo React Native 54, TypeScript | iOS App Store (unlisted link) and Android APK (sideload via `/install`) |
| Admin portal | Next.js 15, TypeScript | Netlify — https://timevera.netlify.app |
| Database, auth, storage, cron | Supabase (Postgres 17, GoTrue, Storage, pg_cron, pg_net) | Supabase project `efszrjuxjqaeqzrwrmuh` |
| Payroll export | Xero Payroll AU API, one Custom Connection per entity | Xero orgs "Build One" and "ARKO Joinery" |
| Push notifications | Expo Push (FCM on Android via Firebase project `timevera-baf99`) | Sent by a Postgres trigger through `pg_net` |
| Invite emails | LeadConnector (GoHighLevel) webhook | Hard-coded URL in `admin/app/(dashboard)/employees/actions.ts`, overridable with `INVITE_WEBHOOK_URL` |

Source code: GitHub `teDdyMucho/TimeTracker` (monorepo: `admin/`, `mobile/`, `supabase/`, `packages/shared/`).

## 2. Accounts and who owns them today

| Service | Identifier | Current owner | Needed for |
| --- | --- | --- | --- |
| GitHub repo | `github.com/teDdyMucho/TimeTracker` | teDdyMucho | Code, Netlify deploys |
| Netlify site | `timevera.netlify.app` (base `admin/`, `@netlify/plugin-nextjs`, Node 20) | Developer's Netlify account | Admin hosting, env vars |
| Supabase project | ref `efszrjuxjqaeqzrwrmuh` | Developer's Supabase org | Database, auth, storage, cron |
| Expo / EAS | account `flixxy` (tapangjoseangelo@gmail.com), project `timevera-timesheets`, id `6f6a8036-…` | Jose Angelo Tapang | Mobile builds, OTA, push project id |
| Apple Developer | Team `Z569DQP3YF` (Jose Angelo Tapang, Individual); App Store Connect app id `6787161301` | Jose Angelo Tapang | iOS releases |
| Google Play | not used — Android is distributed as an APK | — | (optional future Play listing) |
| Firebase | project `timevera-baf99` (`mobile/google-services.json`) | Developer | Android push (FCM) |
| Xero apps | two Custom Connections (Build One, ARKO Joinery); client ids/secrets in Netlify env | Client's Xero admin authorised them | Payroll export |
| LeadConnector | webhook for invite emails | Client's GoHighLevel | Login-details email to new workers |
| Domain | none; Netlify subdomain | — | — |

**To transfer:** GitHub — add the client as owner / transfer the repo. Netlify — transfer the site to the client's team (Site settings → Transfer) and re-enter env vars. Supabase — transfer the project to the client's organisation (Project settings → Transfer), or invite the client as Owner. Expo — transfer the project to the client's Expo account (`eas project:transfer`); the iOS bundle id `com.timevera.timesheets` must then be released from the individual Apple team to the client's team (App Store Connect → transfer app) and EAS credentials regenerated. Xero — the client already owns the orgs; rotate the Custom Connection secrets after handover.

## 3. Environment variables

**Netlify (admin):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (Build One), `XERO_CLIENT_ID_ARKO`, `XERO_CLIENT_SECRET_ARKO`, optional `INVITE_WEBHOOK_URL`. Local copy: `admin/.env.local` (never commit).

**EAS (mobile):** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — set per profile in `mobile/eas.json`.

**Supabase Edge Function `send-employee-invite`** (unused): Microsoft Graph secrets, `INVITE_SHARED_SECRET`.

## 4. Database

- Migrations: `supabase/migrations/0001` … `0031`. Applied by hand in the Supabase SQL Editor (the CLI is not linked). `0031` is the Build One rules of 20 Oct 2026: `profiles.employer_entity_id` (whose payroll pays the person) and `profiles.overtime_approver`; overtime requests that can be raised while still on the clock (`overtime_requests.clock_session_id`, linked to the timesheet on clock-out); `clock_sessions.auto_closed`; `notifications.data` (push payload); the 3:06 pm auto clock-out job; weekend-quiet pushes; and the phone's RPCs (`list_overtime_approvers`, `list_my_overtime_approvals`, `decide_overtime_request`, `list_my_overtime_requests`). `0030` removes duplicate pay-rate rows and dates each employee's first rate 2000-01-01 (their baseline) so per-day pricing can never mistake it for a later change.
- Fixed pay rules (in code, `admin/lib/labour-cost.ts`, no settings screen): 30 min unpaid break on any day of 5 h or more; 7.6 h regular a day; anything over is overtime, pending and unpaid until an approver approves it (first 2 h tier 1, then tier 2); Saturday / Sunday / public holiday hours at their loading without a request. Entities → Pay settings now only holds the multipliers. `0028` adds Realtime, audit log triggers, the 5 PM missing-timesheet reminder and RLS guards; `0029` seeds Victorian holidays, writes the unpaid-break default (30 min after 5 h) into each entity's `pay_config` so it is visible in Entities → Pay settings, adds the `auto_pay_run`, `site_url` and `cron_secret` settings, narrows the `settings_read` policy so a worker's login can never read `cron_secret`, and schedules the automatic pay-run cron.
- Scheduled jobs (pg_cron): `auto-clock-out-afternoon` (04:06/04:16 and 05:06/05:16 UTC Mon–Fri; acts only at 15:06–15:59 Melbourne: anyone still clocked in with no pending/approved overtime request for that session is recorded as 7:00 am – 3:06 pm and told), `auto-clock-out-nightly` (13:00 and 14:00 UTC; whatever is still open from an earlier day is closed as 7:00 am – 3:06 pm too — a missed clock-out never creates overtime; the row is marked auto-closed for the office to correct by hand), `remind-missing-timesheets` (hourly, acts at 17:00 Melbourne on weekdays), `auto-pay-run-period-end` (13:30 and 14:30 UTC → POSTs `<site_url>/api/payroll/auto-run` with the `cron_secret` setting; the route handles each period once, recorded in `auto_pay_run.lastPeriodEnd`, so a run an admin deleted is not re-created the next night). To rotate the secret, update the `cron_secret` row. For a staging database, change the `site_url` row rather than the function.
- Money tables (`pay_rates`, `payroll_runs`, `payroll_entries`, `project_financials`, `audit_logs`) are admin-only under RLS; the admin portal reads them with the service-role key.
- Storage buckets: `selfies` (public read, 5 MB), `avatars` (public read, 5 MB), `APK` (public, created but empty — the project's file-size cap is below the APK size).
- Backups: Supabase daily backups (Pro plan) — confirm the plan after transfer. A manual export is `pg_dump` with the connection string from Project settings → Database.

## 5. Settings that live in the app

| Where | What |
| --- | --- |
| Settings → Pay cycle | Frequency and the first day of a known period |
| Settings → Automatic pay run | On/off, "Run now" (always attempts the last completed period; entities that already have a run are skipped) |
| Settings → Labour cost alerts | Threshold %, default project budget |
| Settings → Security | Admin authenticator app (2FA), "require 2FA for all admins" |
| Entities → Pay settings | Overtime tier 1 / tier 2, Saturday, Sunday and public-holiday multipliers only. The rules (30 min break on days of 5 h+, 7.6 h regular, overtime pending until approved) are fixed |
| Employees → Edit | Employer (payroll company — wages always go to this company's Xero), "Can approve overtime" (Robbie, Mitch, Chris, Terry) |
| Public Holidays | Dates paid at the public-holiday rate (VIC loaded to end 2027; add the AFL Grand Final Friday when gazetted) |
| Employees | Role, supervisor, rate with "applies from" date (each worked day is priced with the rate in force that day; a rate entered after the work was done still pays, using the earliest rate), flat rate, entity access |

## 6. Releasing

- **Admin:** push to `main` → Netlify builds and deploys. Do not run `npm run build` in `admin/` while `next dev` is running (they share `.next`).
- **Mobile:** bump `version` in `mobile/app.json`; `eas build --platform android --profile preview` (APK) and `eas build --platform ios --profile production`; `eas submit --platform ios --latest`; then in App Store Connect create the version, pick the build and Submit for Review. Put the APK on Google Drive and update `admin/app/(dashboard)/downloads/install-links.tsx`.
- Migrations: paste the new `supabase/migrations/00NN_*.sql` into the SQL Editor and run it, then commit.

## 7. Runbook

| Symptom | Check |
| --- | --- |
| Pay run shows $0 for someone | Employees → that person has no hourly rate |
| Hours missing from a pay run | Attendance must be **approved**; then Recalculate the run |
| "No matching employee" on Xero push | Name or email differs between Timevera and Xero payroll |
| Xero push failed | Admin bell shows the reason; Entities → Reconnect Xero if the token expired; `/xero` lists live employees and earnings rates |
| Xero push says "hours no longer match the approved attendance" | Attendance was approved (or pay rules changed) after the run was created. Recalculate the run, check it, push again. The push always sends what the run page shows. |
| Worker's phone shows a red "could not be sent" card | The server refused a queued clock-in/out (for example a constraint). The hours are not in the system: add them with Attendance → Add attendance, then the worker taps Dismiss. |
| Worker gets "Already clocked in" with no signal | The phone still holds an open session from earlier (or a queued clock-in). They should clock out on Home first; if the session was closed elsewhere, pull down on Home once they have signal. |
| Worker was clocked out at 3:06 pm but really worked late | They had no overtime request in for that session. Attendance → Edit the session's clock-out time; the row shows an "auto" marker. Next time they tap "Overtime today?" → Send request before 3:06 pm. |
| Approver did not get the overtime push | The approver must have the app installed and signed in (push token on their profile) with notifications on; the push carries Approve / Reject buttons. Overtime pushes are the only ones sent at weekends. The request is also on the Overtime page and the app's Approvals screen. |
| Someone cannot approve overtime on the Overtime page | Only people with "Can approve overtime" ticked (Employees → Edit) decide; everyone else sees the page read-only. |
| A pay run looks short for someone | Overtime awaiting approval is listed on the run but not paid. Approve it on the Overtime page, then Recalculate the run. |
| Worker stuck on the selfie step | Fixed in 7.5 (no GPS fix no longer blocks); ask them to update |
| Worker's hours "saved on phone" | Offline mode (7.6): they sync when the phone is back online; the Home banner has Sync now |
| Nobody got a push | `profiles.expo_push_token` must be set and `notifications_enabled` not false; Expo Go cannot receive push, only store builds |
| Dashboard not live-updating | Migration 0028 adds the Realtime publication |

## 8. Known limits and decisions outstanding

- Hosting is Netlify, not Vercel as the PRD said; payroll and Xero code runs in Next.js, not Edge Functions. Both work; changing them is a client decision.
- The selfie bucket is public-read by URL (needed by the admin photo preview).
- Invite emails contain the initial password in plain text (LeadConnector template).
- `mobile/Timevera.apk` in the repo is a stale 0.1.0 build; the real APK is distributed from the install page link.
- Unpaid break when a worker's day spans both companies: the break comes off the company they worked the most for, using that company's rule only (the other company's rule is ignored that day). The Pay settings dialog says so.
- Reports filtered by entity or project are computed from the whole day (break and primary company decided on all of the worker's rows) and then filtered, so a filtered total always reconciles with the unfiltered report and with payroll.
- Verify in Xero reads every timesheet in the Xero organisation (no date filter in the Xero AU Payroll API); fine at this size, slow for a large org.
- Mobile offline queue (7.6): items the server rejects outright are moved to a "could not be sent" list on the phone and never retried; temporary failures are retried up to 20 times. The queue is keyed by user, so signing in as someone else on the same phone does not send their items.
