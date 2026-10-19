# Timevera (Build One) — PRD Compliance Report

**Date:** 14 October 2026
**Scope:** `05_Internal_Timevera_Requirements.md` (PRD v1.0) checked against the code in this repo at commit `52c1694` (EOD 7 Oct 2026).
**Method:** read-only review of `mobile/`, `admin/`, `supabase/migrations/`, `supabase/functions/` and `packages/shared/`. No code was changed.

Legend: ✅ Built as specified · 🟡 Partial · 🔁 Built, but a different design than the PRD · ❌ Not built

---

## 1. Summary

| Area | Score | One-line verdict |
|---|---|---|
| Mobile app (§6–8) | 🔁 Mostly built | Clock-in/clock-out with selfie + GPS instead of typed hours. Every PRD field is captured, just via a different flow. |
| Overtime (§9–10) | 🟡 | Rules, request and approval all exist. Approval does **not** change pay — overtime is paid from daily hours alone. |
| Labour cost engine (§11) | 🟡 | Band/multiplier engine works and is verified in production pay runs. Per-project cost is computed on the fly only; nothing is stored. |
| Employee management (§12) | 🟡 | Create / edit / archive / pay rate / entity access done. No supervisor assignment. |
| Project management (§13) | 🟡 | Create / archive / code / client done. No budgets, dates, actuals, or edit screen. |
| Admin dashboard (§14) | 🟡 | Hours-based metrics only. No $ metrics, no cost summaries, no Realtime. |
| Payroll (§15) | 🟡 | Pay runs, bands, gross pay, PDF, Recalculate, Delete work. No cycle config, no allowances, status flow is draft → approved only. |
| Xero (§16) | 🔁 🟡 | Hours (and approved leave) push to Xero as draft timesheets. Gross pay is not sent; Xero prices the hours. Sync status is never recorded. |
| Reporting (§17) | 🟡 | Hours by project, site vs workshop, straight-time cost estimate. No overtime report, no budget variance, no CSV/XLSX. |
| Notifications (§18) | 🟡 | Employee and supervisor pushes work (DB trigger → Expo). Admin-side alerts (payroll ready, Xero failed, cost threshold) do not exist. |
| Security (§19) | ✅ with gaps | Money tables are admin-only under RLS and the mobile app never selects them. Several RLS policies let employees self-approve records (see section 3 of this report). |
| Database (§20) | ✅ | All 13 PRD tables exist under the PRD names, plus 4 extra. `audit_logs` is never written to. |
| Tech stack (§5) | 🟡 | Expo 54 / Next 15 / Supabase as specified. Hosted on **Netlify**, not Vercel. No Edge Functions for payroll or Xero (both run in Next.js). Shared engine package exists but is not imported. |

Built beyond the PRD: selfie + GPS + address at clock-in, leave requests, two-way messaging, auto clock-out at 16 h, clock-in and clock-out reminders, labour-hire employment type, flat-rate pay, per-employee timesheet PDF, public install page, archived-user lockout at DB level.

---

## 2. Section-by-section findings

### §4 User roles

| Requirement | Status | Evidence |
|---|---|---|
| Employee: log hours, select project / company / location, submit overtime, view own timesheets | ✅ | `mobile/app/(app)/clock-in.tsx`, `switch-project.tsx`, `history.tsx` |
| Employee cannot see pay rates / labour cost / payroll / other employees | ✅ | RLS `0002_rls.sql` (admin-only on `pay_rates`, `payroll_*`, `project_financials`); `mobile/lib/queries.ts` selects an explicit column list from `profiles` with no money fields |
| Supervisor: review / approve / reject overtime, view team timesheets | ❌ | DB policies for supervisors exist (`ts_team_read`, `ot_super_update`) but no UI uses them. Mobile has no supervisor mode; admin middleware signs out any non-admin. Supervisors only receive pushes ("Overtime request from X") and cannot act on them. |
| Admin: manage employees, projects, pay rates, run payroll, reports, labour costs | ✅ | `admin/app/(dashboard)/*` |
| Admin: manage public holidays | ❌ | Table exists and is read by payroll; no admin page writes to it. Only QLD 2026 holidays are seeded (`supabase/seed.sql`). |

### §5 Technology stack

| PRD | Actual | Status |
|---|---|---|
| Expo React Native, TypeScript | Expo SDK 54, RN 0.81, TS 5.9 strict, expo-router 6 | ✅ |
| Zustand | Used for the auth store only | ✅ |
| React Hook Form | Installed, never imported (forms use `useState`) | 🟡 |
| NativeWind | NativeWind 4 throughout | ✅ |
| Expo Push Notifications | `expo-notifications`, token stored in `profiles.expo_push_token` | ✅ |
| Supabase Auth (email/password, JWT) | Yes; sign-up disabled, admin creates users | ✅ |
| Supabase Postgres + RLS | Yes, RLS on every table | ✅ |
| Supabase Edge Functions (payroll, Xero, notifications) | One function only (`send-employee-invite`) and it is unused. Payroll = Next.js server actions; Xero = Next.js API routes; push = DB trigger + `pg_net` | 🔁 |
| Supabase Storage | `selfies` and `avatars` buckets (both public-read) | ✅ |
| Supabase Realtime (live dashboard) | Not used anywhere. Attendance page polls every 30 s; mobile messages poll every 8 s | ❌ |
| Next.js, TypeScript | Next 15.3.9, React 19 | ✅ |
| Hosting: Vercel | **Netlify** (`netlify.toml`, `timevera.netlify.app`) | 🔁 |
| Xero Payroll API | Yes, via Custom Connection (client credentials), one app per entity | ✅ |

### §6 Mobile — Login and Home

| Requirement | Status | Note |
|---|---|---|
| Email + password login | ✅ | `signInWithPassword`; session persisted in AsyncStorage with auto-refresh |
| Forgot password | ✅ | `resetPasswordForEmail`; reset completes outside the app (no deep link) |
| Face ID / fingerprint | 🟡 | Implemented as an opt-in **app lock** (`lib/biometric.ts`), not a biometric sign-in. Locks on cold start only, not on return from background. |
| Home: Today's hours | ✅ | |
| Home: Weekly hours | ✅ | Monday-start week |
| Home: Pending overtime | ✅ | Counts this week's pending requests only |
| Home: Recent timesheets | ✅ | Last 10, with "View all" |
| Home: Quick log button | 🔁 | "Clock In" / "Clock Out" instead of "Log Hours". A manual `log.tsx` screen exists but nothing navigates to it. |

### §7 Timesheet entry flow

| Step | Status | Note |
|---|---|---|
| 1. Select business (Build One / ARKO Joinery) | ✅ | Chips, shown only when the user has access to more than one entity |
| 2. Searchable project dropdown | 🟡 | Plain tappable list, no search. The searchable picker exists only in the unused `log.tsx`. |
| 3. Work location (On Site / Factory-Workshop) | ✅ | Segmented control, required |
| 4. Hours input, 0.5 min / 24 max | 🔁 | Hours are derived from clock-in → clock-out by DB trigger (`0024_timesheets_from_sessions`), rounded to the minute, clamped 0.02–24. No typed hours. |
| 5. Overtime yes/no | ✅ | Toggle at clock-out |
| 6. Overtime reason (if yes) | ✅ | Required; Clock Out is disabled until filled |
| 7. Confirmation "Timesheet Successfully Submitted" | ❌ | Clock-in and clock-out return to Home silently. Only Switch Project and Leave show an alert. |
| Under 20 seconds | 🟡 | Selfie + GPS capture adds time to clock-in; not measured. |

Extra: selfie (front camera, uploaded to `selfies` bucket), GPS lat/lng and reverse-geocoded street address at clock-in. Auto clock-out at 16 h (device and nightly server cron at 13:00 and 14:00 UTC).

### §8 Multi-project allocation

| Requirement | Status | Note |
|---|---|---|
| Multiple entries per day | ✅ | Several clock-in/out cycles per day are allowed |
| Split a day across projects | ✅ | "Switch Project" closes the current session and opens a new one on the next project, reusing the selfie and GPS |

### §9 Overtime rules

| Band | PRD | Actual default (`business_entities.pay_config`) | Status |
|---|---|---|---|
| Standard | 8 h ×1.0 | 0–8 h ×1.0 | ✅ |
| OT tier 1 | hours 9–10 ×1.5 | 8–10 h ×1.5 | ✅ |
| OT tier 2 | hours 11+ ×2.0 | 10 h+ ×2.0 | ✅ |
| Saturday | ×1.5 configurable | ×1.5 | ✅ |
| Sunday | ×2.0 configurable | ×2.0 | ✅ |
| Public holiday | ×2.5 configurable | ×2.5 | ✅ |
| "Configurable" | Per-entity JSON in DB | **No admin UI to edit it.** The run detail page tells admins to "adjust multipliers per entity" but there is nowhere to do so. | 🟡 |

Flat-rate employees (not in PRD): `profiles.flat_rate` puts every hour on the ordinary band with no loading.
Note: `supabase/seed_entities.sql` writes `pay_config` in an older incompatible shape (no `weekdayTiers`). If an entity were created from it, payroll would throw.

### §10 Overtime approval workflow

| Step | Status | Note |
|---|---|---|
| Employee submits overtime | ✅ | Only at clock-out; cannot be added afterwards |
| Supervisor notification | ✅ | DB trigger fans out to admins + supervisors with push tokens |
| Approve or reject | 🟡 | Admin only (`admin/app/(dashboard)/overtime`). Supervisors have no screen. `decided_by` is never recorded. |
| Payroll updated | ❌ | **Approval has no effect on pay.** Payroll, Xero push and per-project cost band overtime purely from daily hours over 8 and never read `overtime_status`. Rejected overtime is still paid at 1.5×/2×. |
| Employee notified | ✅ | "Overtime approved" / "Overtime declined" push + inbox |

### §11 Labour cost engine

| Item | Status | Note |
|---|---|---|
| Inputs: rate, hours, OT rules, entity, project, location, holidays, weekend | ✅ | `admin/lib/payroll.ts` (`classifyDay`, `splitDayHours`, `grossPay`, `aggregatePayroll`, `aggregateByProject`) |
| Project labour cost | 🟡 | Computed on demand in the "Payroll per project" tab (day cost apportioned across projects by hours). Never stored in `project_financials.actual_labour_cost`. |
| Business labour cost | 🟡 | Pay-run gross per entity; no stored rollup |
| Employee labour cost | ✅ | `payroll_entries.gross_pay`, `band_cost` |
| Payroll cost | ✅ | Pay run totals |
| Site vs workshop cost | ❌ | Reports show site vs workshop **hours**; "Est. Labour Cost" on Reports is straight-time only, not split by location |
| Shared engine (`packages/shared`) | 🟡 | Exists with tests, but neither app imports it. `admin/lib/payroll.ts` is a hand-copied, now-drifted version (flat-rate and per-project logic exist only in the admin copy). |

### §12 Employee management

| Requirement | Status | Note |
|---|---|---|
| Create | ✅ | Invite modal; `auth.admin.createUser` with pre-confirmed email |
| Edit | ✅ | Role, employment type, rate, flat-rate, entity access, admin password reset |
| Archive | ✅ | Deactivate/Activate; DB migration `0023` revokes sessions and blocks archived JWTs |
| Assign supervisor | ❌ | `profiles.supervisor_id` exists in DB; no UI or action sets it |
| Assign pay rate | ✅ | New `pay_rates` row on change; latest rate used. `cost_rate` unused; `effective_from` ignored by payroll (latest rate applies to back-dated runs). |
| Fields: ID, name, email, phone, rate, type, supervisor, business access, status | 🟡 | Phone is in DB but not in the UI. Supervisor not assignable. Types include the extra `labour_hire`. |
| Invite email | 🔁 | Sent via a LeadConnector (GoHighLevel) webhook with the plaintext password. The `send-employee-invite` Edge Function (Microsoft Graph) exists but is not called. |

### §13 Project management

| Requirement | Status | Note |
|---|---|---|
| Create | ✅ | Name, client, code, entity |
| Archive | ✅ | Archive/Restore toggle |
| Edit | ❌ | No edit screen |
| Budget hours / budget labour cost | ❌ | DB columns exist (`projects.budget_hours`, `project_financials.budget_labour_cost`); nothing reads or writes them |
| Start / end date | ❌ | Columns exist; no UI |
| Actual hours / actual labour cost | ❌ | Columns exist; nothing updates them. Actuals are computed on demand only. |

### §14 Admin dashboard

| Metric | Status | Note |
|---|---|---|
| Total hours | ✅ | "Hours This Week" with week picker and trend |
| Total labour cost | ❌ | No $ figure on the dashboard |
| Total overtime cost | ❌ | Only a pending-overtime **count** |
| Active employees | ✅ | |
| Active projects | ✅ | |
| Payroll due | ❌ | |
| Labour cost summary by project / employee / business / location | ❌ | Dashboard shows "Top Projects by Hours" and a per-employee hours chart; no cost views |
| Live updates (Realtime) | ❌ | Server-rendered on load |

### §15 Payroll module

| Requirement | Status | Note |
|---|---|---|
| Fortnightly cycle, configurable | 🟡 | Form defaults to the last 14 days. `settings.pay_cycle` is seeded but never read. |
| Regular / OT / weekend / PH hours | ✅ | Six bands stored in `payroll_entries.band_hours` |
| Allowances | ❌ | Column exists, never used |
| Gross pay | ✅ | hours × latest rate × multiplier, stored per employee |
| Review screen (employee, hours, OT, gross, status) | ✅ | Run list + run detail page |
| Draft → Reviewed → Approved → Exported | 🟡 | Only Draft → Approved is reachable. Reviewed and Exported never set. |
| Only approved attendance of active staff is paid | ✅ | Enforced since 6 Oct (client rule) |
| Overlap guard + Recalculate | ✅ | Added 7 Oct |
| PDF export | ✅ | Per run, per entity, per employee; inline view |

### §16 Xero integration

| Requirement | Status | Note |
|---|---|---|
| "Export Payroll to Xero" button | ✅ | "Push to Xero" per run (`api/xero/push-timesheet`) |
| Employee, hours, OT, pay categories, entity | ✅ | One Xero timesheet per employee, one line per band, mapped to earnings rates by **name heuristics** ("ordinary", "overtime first", "x2", "saturday" …). No mapping UI. Employee matched by email then name. |
| Allowances | ❌ | |
| Gross pay | 🔁 | Not sent. Hours only; Xero applies the employee's own pay template. |
| Sync status Pending / Success / Failed | ❌ | `payroll_runs.xero_sync_status` is never updated after a push. Code checks for `'synced'`, which is not an enum value (`not_synced`, `pending`, `success`, `failed`), so the "already pushed to Xero" locks on Recalculate and Delete never trigger. |
| Auth model | 🔁 | Xero Custom Connection (client credentials), one app per entity, matched to the entity by org name. Not per-entity OAuth. `xero_connections` table and `/callback` are legacy. |
| Extra | ✅ | Approved leave pushed as Xero LeaveApplications; pay-calendar period alignment; tracking category on lines; live Xero employee / earnings-rate viewer at `/xero`. |
| Known operational issue | ⚠️ | Build One's Xero connection needs re-authorising by Chris (EOD 7 Oct). `api/xero/push-leave` queries a non-existent column and is unused. |

### §17 Reporting

| Report | Status | Note |
|---|---|---|
| Labour cost by project (hours, cost, OT, budget variance) | 🟡 | "Hours by Project" (hours + %) on Reports; loaded cost per project in the Payroll per-project tab. No OT column, no budget variance. |
| Labour cost by employee | ❌ | Per-employee hours in the dashboard chart only; no cost table |
| Site vs factory analysis | 🟡 | On-site vs Workshop **hours** and a bar; no cost split |
| Business entity report | 🟡 | Entity is a filter, not a report |
| Overtime report | ❌ | |
| Filters: date range, project, business | 🟡 | Date range, entity, employee. No project filter on Reports. |
| Export | 🟡 | PDF only (per-employee Fortnightly Timesheet PDF, pay-run PDFs). No CSV / XLSX. |

### §18 Notifications

| Notification | Status | Source |
|---|---|---|
| Employee: timesheet submitted | ❌ | No such type. (Overtime and leave submissions do get a confirmation.) |
| Employee: overtime approved / rejected | ✅ | Admin action → `notifications` → DB trigger → Expo push |
| Employee: missing timesheet reminder | 🟡 | Device-local only: 5:00 PM "Log your hours", and only scheduled if the user toggles the Settings switch. No server check for missing days. |
| Supervisor: overtime awaiting approval | ✅ | DB trigger fan-out to admins + supervisors |
| Supervisor: timesheet missing | ❌ | |
| Admin: payroll ready | ❌ | |
| Admin: failed Xero sync | ❌ | |
| Admin: labour cost threshold exceeded | ❌ | |
| Extra | ✅ | Attendance approved/rejected, leave approved/rejected, new message, auto clock-out (worker and team), 6:50 / 7:10 AM clock-in reminders, 3:07 / 3:12 PM clock-out reminders (mobile 7.4) |

Push dispatch is a Postgres trigger calling Expo's push API through `pg_net` (`0020_push_notifications.sql`), not an Edge Function. Tapping a push opens the app but does not deep-link to a screen.

### §19 Security

| Requirement | Status | Note |
|---|---|---|
| Supabase Auth, email/password, JWT | ✅ | Sign-up disabled; 1 h JWT with refresh rotation |
| RBAC via RLS, roles employee / supervisor / admin | ✅ | `user_role` enum; `is_admin()`, `is_supervisor_of()`, `has_entity_access()`, `is_active_user()` helpers |
| Employees cannot access pay rates, payroll, labour costs, reports | ✅ | Admin-only policies on `pay_rates`, `project_financials`, `payroll_runs`, `payroll_entries`, `audit_logs`; mobile never queries them |
| Admin dashboard access | ✅ | Middleware signs out non-admin or archived users |

Gaps found during the review (see section 3 for the full list): employees can self-approve timesheets, attendance and leave through RLS; `pay_config` and `xero_tenant_id` are readable by every signed-in user; selfie bucket is publicly readable by URL; plaintext passwords are sent in invite emails.

### §20 Database tables

All 13 PRD tables exist under the PRD names in `0001_schema.sql` with the PRD readability model enforced by `0002_rls.sql`.

| Table | Status | Note |
|---|---|---|
| profiles | ✅ | + `avatar_url`, `notifications_enabled`, `flat_rate`, `expo_push_token` |
| pay_rates | ✅ | Admin-only |
| projects | ✅ | + `code`; budget/date columns unused |
| project_financials | ✅ | Admin-only; never written by the app |
| timesheets | ✅ | Hours only; now generated from `clock_sessions` by trigger; `clock_session_id` link |
| overtime_requests | ✅ | |
| payroll_runs / payroll_entries | ✅ | Admin-only |
| business_entities | ✅ | Holds `pay_config` and `xero_tenant_id`, readable by all signed-in users |
| public_holidays | ✅ | QLD 2026 seed only; `region` ignored by payroll |
| notifications | ✅ | |
| audit_logs | 🟡 | Exists, admin-only, **never written** |
| settings | 🟡 | Exists, seeded, **never read** |
| Extra tables | — | `clock_sessions`, `leave_requests`, `messages`, `xero_connections` (legacy) |

### §21 Performance / §22 Success metrics

Not measurable from code. No instrumentation exists. Nothing in the repo contradicts the targets, but none are verified.

### §23 Phase 2 items already built

GPS verification (lat/lng + address at clock-in), leave management (mobile + admin + Xero leave push), photo attachments (clock-in selfie). Geofencing, QR check-in, safety forms, vehicle tracking, expenses and forecasting are not built.

---

## 3. Issues found during the review (not in the PRD, worth a decision)

Ordered by impact. None of these were changed.

1. **Overtime approval does not gate overtime pay.** Payroll bands by daily hours and never reads `overtime_status`. Rejected overtime is still paid at 1.5× / 2×. (`admin/app/(dashboard)/payroll/actions.ts`, `admin/lib/payroll.ts`)
2. **Xero sync status is never recorded.** After a push nothing updates `payroll_runs.xero_sync_status`, and the UI checks for a value (`synced`) that the enum does not contain. The "already pushed" protections on Recalculate and Delete therefore never fire.
3. **Employees can self-approve via RLS.** `ts_owner_insert` / `ts_owner_update` do not restrict `status` or `overtime_status`; `cs_own` is FOR ALL so an employee can set `review_status = 'approved'` or edit their clock times; leave can be inserted pre-approved (`0023_block_archived_users.sql`). The mobile app does not do this, but a crafted request could.
4. **Employees can insert messages as `sender_role = 'admin'`** in their own thread (the check was dropped in `0023`).
5. **Profile guard trigger** lets an employee change their own `flat_rate`, `employment_type` and `name`, and skips all checks when there is no JWT.
6. **`notify_admins()` is callable by any authenticated user via RPC**, which allows pushing to every admin and supervisor.
7. **Selfie bucket is public-read.** Anyone with a URL can view a worker's photo (`0008`, `0009`).
8. **Plaintext passwords in invite emails** (LeadConnector webhook, and the unused Edge Function). Hard-coded admin credentials sit in `supabase/seed_admin*.sql`, `make_admin_profile.sql`, `reset_admin_user.sql`.
9. **Public holidays**: only QLD 2026 is seeded while sites run on Melbourne time; `region` is ignored; no 2027 data; no admin UI. Payroll will mis-band from 1 Jan 2027 unless rows are added.
10. **`seed_entities.sql` writes an incompatible `pay_config` shape** that would crash payroll if applied.
11. **History screen** matches selfies and times to timesheets by day + location rather than `clock_session_id`, so a multi-session day can show the wrong photo.
12. **Stale type definitions**: `admin/lib/types.ts` declares `xero_sync_status` and payroll status values that do not match the DB enums; `packages/shared` is missing `labour_hire` and `flat_rate`.
13. **Committed APK is stale**: `mobile/Timevera.apk` is version 0.1.0 without push permissions; the real 7.4 APK is on Google Drive.
14. **Operational (from EOD notes)**: Build One Xero connection needs re-authorising; William Kong has no pay rate so gross shows $0; older pay runs (Aug, 11–24 Sep) are stale; iOS 7.4 (12) awaiting App Review.

---

## 4. Gap list for the client (what the PRD asks for that is not there)

| # | PRD item | Effort guess |
|---|---|---|
| 1 | Overtime approval must drive overtime pay (or confirm the client wants hours-based OT) | Small, but a policy decision |
| 2 | Supervisor role: assign supervisor to employees; supervisor approval screen (mobile or web) | Medium |
| 3 | Admin UI for per-entity pay config (OT ladder, weekend, PH multipliers) | Small |
| 4 | Admin UI for public holidays (+ VIC 2026/2027 data) | Small |
| 5 | Project budgets, dates, and stored actuals; budget-variance report | Medium |
| 6 | Dashboard $ metrics: total labour cost, overtime cost, payroll due; cost by project / employee / entity / location | Medium |
| 7 | Reports: labour cost by employee, overtime report, business-entity report, CSV/XLSX export, project filter | Medium |
| 8 | Xero sync status write-back (pending / success / failed) and "Exported" run status | Small |
| 9 | Payroll: Reviewed / Exported statuses, allowances, pay-cycle setting | Small–Medium |
| 10 | Admin notifications: payroll ready, Xero failed, cost threshold | Small |
| 11 | Server-side missing-timesheet reminder (employee + supervisor) | Small |
| 12 | "Timesheet submitted" confirmation on clock-out; searchable project list | Small |
| 13 | Supabase Realtime for live dashboard (or accept polling) | Small |
| 14 | `audit_logs` writes (triggers on money tables) | Small |
| 15 | Move to Vercel, or update the PRD to say Netlify | Decision only |
| 16 | Edge Functions for payroll / Xero (PRD §5), or update the PRD to say Next.js server | Decision only |

---

## 5. Implementation status (14 Oct 2026, same day)

Everything in the gap list except the two decision-only items (15, 16) was built in the working tree. Nothing is committed or deployed, and the migration has not been applied.

| # | Gap | Status | Where |
|---|---|---|---|
| 1 | Overtime approval drives pay | Done, **off by default** per entity | `admin/lib/labour-cost.ts`, Entities → Pay settings switch "Overtime must be approved" |
| 2 | Supervisor role | Done (web) | Employees → Supervisor field; supervisors sign in to the dashboard and see only Overtime / Attendance / Leave for their team |
| 3 | Pay config UI | Done | Entities → Pay settings |
| 4 | Public holidays UI | Done | New `/holidays` page |
| 5 | Project budgets, dates, actuals, variance | Done | Projects → Edit; actuals and budget bars on the list; variance on Reports |
| 6 | Dashboard $ metrics and cost summaries | Done | Labour cost, overtime cost, payroll due cards; Labour Cost Summary by project / employee / business / location |
| 7 | Reports | Done | Labour cost by project (with variance), by employee, business entity, site vs factory with cost, overtime report, project filter, CSV on every table |
| 8 | Xero sync status | Done | Push sets pending → success / failed; success marks the run Exported; `synced` checks fixed |
| 9 | Payroll statuses, allowances, pay cycle | Done | Mark reviewed → Approve; per-employee allowances on the run page; Settings → Pay cycle drives the default period |
| 10 | Admin notifications | Done | Payroll ready, Xero push failed, labour cost threshold; shown in the dashboard bell and pushed to admin phones |
| 11 | Missing-timesheet reminder | Done (migration) | `remind_missing_timesheets()` hourly cron, fires at 5 PM Melbourne on weekdays |
| 12 | Clock-out confirmation, searchable projects | Done (mobile, needs build 7.5) | Alerts on clock-in and clock-out; search box when more than 4 projects |
| 13 | Realtime dashboard | Done | Dashboard subscribes to timesheet / attendance / request changes |
| 14 | audit_logs writes | Done (migration) | Row-change triggers on the money and config tables |
| 15 | Vercel vs Netlify | Not changed | Decision for the client |
| 16 | Edge Functions vs Next.js | Not changed | Decision for the client |

Also fixed from section 3: `seed_entities.sql` shape is tolerated by `normalizePayConfig`, stale type definitions, and the RLS self-approval gaps (migration 0028 adds guard triggers for timesheets, attendance, leave, messages and profile pay fields).

### To go live

1. Apply `supabase/migrations/0028_prd_completion.sql` in the SQL Editor.
2. Deploy the admin app (Netlify picks up the commit).
3. Build mobile 7.5 for the clock-in / clock-out confirmations and project search.
4. Decide per entity whether to switch on "Overtime must be approved". It is off, so current pay figures are unchanged.
5. Add VIC 2026 and 2027 public holidays on the new Holidays page, and set labour budgets on projects to enable the threshold alerts.

### Test evidence (14 Oct 2026, Playwright against the local dev server on port 3001, live Supabase project)

24 of 24 browser checks passed. All test data was removed afterwards (temporary pay run, holiday, project budget, admin notifications).

| Area | Check | Result |
|---|---|---|
| Login | admin@buildone.au signs in, lands on dashboard | Pass |
| Dashboard | Labour Cost This Week, Overtime Cost, Payroll Due cards render; Labour Cost Summary tabs switch; bell opens | Pass (payroll due = 8 days) |
| Settings | Pay cycle saves and survives reload; labour alert saves to `settings` | Pass |
| Holidays | Add a holiday, see it in the list, remove it, gone from DB | Pass |
| Entities | Pay settings modal prefilled (8h, tier 1 to 10h, Sat 1.5×); save writes `pay_config` | Pass |
| Employees | Supervisor column; Supervisor dropdown in Edit and Invite; Flat rate in Invite | Pass |
| Projects | Edit sets budget 100h / $1,000; list shows "7h 26m / 100h · 7%" and "$138 / $1,000 · 14%"; revert | Pass |
| Reports | All five sections render; totals $37,835.94 for 25 Sep – 14 Oct; CSV for project / employee / entity / location / overtime all return text/csv | Pass |
| Overtime, Attendance, Leave | Pages load as admin | Pass |
| Payroll | New pay run defaults to 25 Sep – 8 Oct from the pay cycle; temp run 9–14 Oct created for ARKO (8 employees, $4,822.78); 5 admins got "Pay run ready for review"; Draft → Reviewed → Approved; allowance $50 raises gross to $4,872.78 and drops status to draft; Recalculate keeps the allowance; PDF and preview endpoints return 200; delete removes run and entries | Pass |
| Inbox | Dashboard bell lists "Pay run ready for review" | Pass |
| Overtime approval switch | ARKO 25 Sep – 8 Oct, switch off: 461.85h ordinary, 25.7h OT 1.5×, 5.42h OT 2×. Switch on: 492.97h ordinary, 0 overtime (the only approved request that period was a 6.44h day, the other was pending). Switch restored to off. | Pass |
| Console | No console errors across all admin pages | Pass |

Not tested here: supervisor sign-in (no supervisor password available), Xero push write-back (would send real timesheets to Xero), the mobile app (needs a device build), and the migration-dependent features (Realtime, audit log rows, missing-timesheet reminder, RLS guards) because migration 0028 has not been applied.

**Supervisor access (tested with a temporary supervisor account, deleted afterwards):** signing in as a supervisor lands on `/overtime`; the sidebar shows only Attendance, Overtime and Leave; `/`, `/employees`, `/payroll`, `/settings` and `/reports` redirect to `/overtime`; Attendance lists only the one assigned team member (Bastien Delille, assignment reverted) and hides Add / Edit; Leave is scoped the same way; the admin API routes (CSV, payroll PDF, Xero preview) redirect the supervisor away.

### Mobile test evidence (14 Oct 2026, Expo Go 54.0.8 on a Pixel 10 Pro Android emulator, Metro dev server, live Supabase project)

Tested with a temporary worker account (ARKO Joinery, 21 projects), deleted afterwards together with its clock session, timesheet and selfie.

| Check | Result |
|---|---|
| Unit tests for the new helpers in `mobile/lib/clock-feedback.ts` (search filter, search-box threshold, worked-time label, clock-in and clock-out messages) | 19 of 19 pass |
| Metro bundle (`expo export --platform android`) | Compiles |
| Login as worker, Home screen | Pass |
| Clock In → selfie via emulator camera → crop → details step with address "350, Bourke Street, Melbourne, Victoria" | Pass |
| Search box appears with 21 projects; "tekton" filters to the 7 Tekton projects; "zzzz" shows `No projects match "zzzz".`; clearing restores the list | Pass |
| Confirm Clock In → alert "Clocked in — You're on the clock for Cotham Rd. Remember to clock out when you finish." | Pass |
| DB: clock session created (site, selfie uploaded, lat −37.8136, pending review) | Pass |
| Clock Out → alert "Timesheet submitted — 1 min logged for today. It will be paid once your supervisor approves it." | Pass |
| DB: session closed, one linked timesheet (0.02 h, submitted), Home shows the Cotham Rd entry under Recent | Pass |

**Bug found and fixed during the test (pre-existing, not from this change set):** when the phone has no GPS fix or location services are off, `Location.getCurrentPositionAsync` threw inside the selfie step and the worker could not get past "Take a selfie". Clock-in now falls back to the last known position, then to no location, and always continues (`mobile/app/(app)/clock-in.tsx`).

Not tested on device: the overtime variant of the clock-out alert (its text is unit-tested; submitting real overtime would push "Overtime request from …" to the client's supervisors), and the device-local reminders. Both need a 7.5 build on a real phone.

**Also fixed (pre-existing TypeScript errors in the mobile app, found by `tsc` during this test):** `Card` now forwards its `style` prop (the amber "overtime awaiting approval" card and the tinted "On the clock" card on Home were designed with a background colour that was silently dropped), `Button` accepts `className` (the "Open Camera" button's full-width class was ignored), and the clock-in address uses `district` instead of the non-existent `suburb` field. Mobile `tsc` is now clean.

### Review pass evidence (19 Oct 2026)

Three independent code reviews of the 17 Oct work (auth/settings, payroll engine, mobile offline + migration 0029) raised 50 findings; all bugs and risks were fixed and re-tested. Details per finding are in `EOD-2026-10-17.md` (update section).

| Check | Result |
|---|---|
| Admin suite 2 (unpaid break, holidays, settings, auto-run, notifications, run page, CSV, Xero validate, reports, 2FA enrol → sign-in with code → aal1 redirect → remove) on the dev server | 20 of 20 pass |
| Admin suite 1 (dashboard, settings, holidays, entities, employees, projects, reports, overtime/attendance/leave, pay run lifecycle, allowances, recalculate, delete, inbox) on the dev server | 23 of 24 pass; the PDF step timed out at 30 s because the dev server compiled the route on first hit (29.1 s, then 200) |
| Production build (`next build`) smoke: PDF on an existing run (0.8 s), preview JSON row count per entity, six pages, dashboard "paid · unpaid breaks" tile, project-filtered report equals the unfiltered slice, CSV formula guard, wrong cron secret → 401, bad body → 400, `/login/verify` bounce, Xero push refuses an out-of-date run (409, nothing sent) | 17 of 17 pass, no console errors |
| Engine checks compiled from `admin/lib/labour-cost.ts`: 4 h + 5 h two-project day filtered to one project equals its unfiltered slice ($155.56); 4 h + 4 h two-company day: A $140 / B $160 filtered and unfiltered, sum equals the whole; payroll aggregator unchanged (3.5 h ordinary + 0.5 h break) | 18 of 18 pass |
| Pay-cycle arithmetic: fortnightly/weekly periods, strict vs include-today "last completed", monthly anchors on the 15th and the 31st (31 Jan → 27 Feb, 28 Feb → 30 Mar, no drift) | Pass |
| PAY-04 pay rates by worked date (new on 19 Oct): rate on 5 Oct = old rate, 6 Oct = new rate; two 8 h days across a $40 → $50 rise cost $675; a rate dated after the work still prices the day (earliest rate); same-date twin rows resolve to the later entry; a baseline row prices earlier work; an employee with no rate is reported and costs $0 | 11 of 11 pass |
| PAY-04 live, production build: Employees edit form shows "New rate applies from" (default today, Melbourne); a temporary $50 → $60 rise from 18 Sep for one Build One employee, then a temporary run for 11–24 Sep: every entry's gross equals an independent per-day pricing (that employee $6,491.50 at $50 / $60 by day; $6,985.20 if the latest rate had applied to every day). Temporary rate, run, notifications and audit rows removed; the baseline row's date restored | 5 of 5 pass |
| Mobile offline unit tests (`offline-core.ts`): ids, network/permanent error classes, local session, relink, pending session, queued clock-out, shown-session resolution, 16 h-cap reconcile by instant, queue description | 11 groups pass |
| `tsc` admin and mobile; admin production build | Clean / passes (one known benign supabase-js Edge Runtime notice) |
| Mobile 7.6 preview build on the Pixel 10 Pro emulator, live Supabase, temporary worker: login; selfie; network off → Confirm Clock In → "Saved on your phone"; Home banner and "On the clock (saved on phone)" with no server row; Clock Out offline → saved; network on → automatic sync (one "Still offline" alert from the 2.5 s probe, since raised to 5 s): session for Cotham Rd, 1 min, selfie uploaded, linked timesheet 0.02 h submitted, Recent shows it; all test data removed | 9 of 9 pass |
