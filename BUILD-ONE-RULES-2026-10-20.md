# Build One rules — delivery note (20 October 2026)

Robbie's list of 20 Oct 2026 (TV1–TV11), what was built, the test used for each, and what is still needed from Build One. Nothing is committed yet; the code is in the working tree.

## Status at a glance

| # | Item | Built | Tested | Notes |
|---|---|---|---|---|
| TV1 | 30 min unpaid break on any day of 5 h or more; fixed, no settings | Yes | Engine unit tests | Threshold is inclusive (a 5.0 h day loses 30 min). Pay settings screen no longer shows it. |
| TV2 | 7.6 h regular cap; anything over is overtime pending approval; fixed | Yes | Engine unit tests | First 2 h over at tier 1 (1.5×), then tier 2 (2×). Only the multipliers remain editable. |
| TV3 | Approver picked by the worker (Robbie/Mitch/Chris/Terry); push with Approve/Reject; pending and unpaid until approved; timesheet shows approver name and time; Chanelle view-only | Yes | Engine + DB + admin + device scripts (live parts need migration 0031) | Approvers are flagged per person (Employees → Edit). A request can be sent while still on the clock. |
| TV4 | Approved-overtime report per pay period, run and export | Yes | Admin script (CSV + Excel) | Reports → Approved Overtime: pay-period picker, Excel and CSV. |
| TV5 | Separate company reports | Yes | Admin script | Reports has All / Build One / ARKO Joinery tabs; every table and export follows the tab. |
| TV6 | Hours go to the project; wages to the employee's own employer | Yes | Engine unit tests + admin script | New "Employer (payroll)" per employee; pay runs and the Xero push group by employer; project cost reports unchanged. |
| TV7 | Hours by project per pay period: project, employee, company, regular, overtime, total; no dollars | Yes | Admin script | Reports → Hours by Project, Excel and CSV. |
| TV8 | No notifications on Saturday / Sunday except overtime approval | Yes | SQL review + app code review | Server pushes are suppressed at weekends except overtime request / approved / declined; phone reminders (6:50, 7:10, 2:55, 5:00) are Monday–Friday only. |
| TV9 | 2:55 pm reminder; 3:06 pm auto clock-out recorded 7:00–3:06 unless an overtime request is in; never creates overtime | Yes | DB script (nightly fallback), engine test (7:00–3:06 = 7.6 h, no OT) | The 3:06 pm job runs on weekdays; the overnight job closes anything still open the same way. Both mark the row "auto" for the office. |
| TV10 | Download timesheets: any employee or all, any period, Excel and PDF | Yes | Admin script | Attendance → Download timesheets (Excel / PDF / CSV); Reports → Timesheets PDF / Excel. |
| TV11 | Separate logins | Already the case | Verified | Timevera has its own Supabase Auth; every person signs in with their own email. Nothing is shared with the dashboard (see answers below). |

## Answers to Robbie's three questions (facts for Jose to send)

1. **TV1–TV11 by 28 October:** all eleven are built in this working tree. Going live needs: migrations 0030 and 0031 run in the Supabase SQL Editor, the admin committed and deployed (Netlify), and mobile 7.7 built and installed by the workers (iOS via App Store, Android via the install page). Approvers must have the app installed and notifications allowed to receive the Approve/Reject push.
2. **Push notifications:** yes, working. Pushes are sent by the database to Expo the moment a notification row is written; most active workers already have a push token registered (seen on their profiles), and overtime/attendance/payroll pushes have been going out. Expo Go builds cannot receive push; the store builds can.
3. **Shared hosting / database / code / logins:** no. Timevera is its own GitHub repository (teDdyMucho/TimeTracker), its own Netlify site (timevera.netlify.app), its own Supabase project (efszrjuxjqaeqzrwrmuh) with its own logins, and its own Expo/EAS project. The dashboard project does not reference any of them. The only shared thing today is that those accounts are held by the developer; Section 3 of Robbie's document (transfer to Build One-owned accounts) is the handover step.

## Assumptions made (say if any is wrong)

- Weekend and public-holiday hours are paid at their loading without an overtime request (they are never "regular"). Only weekday hours over 7.6 need approval.
- "Recorded as 7:00 am to 3:06 pm" is applied literally, whatever the actual clock-in time, so the day is exactly 7.6 paid hours. The office can edit the row (it is marked "auto").
- A session with an overtime request that is still open overnight is also closed as 7:00–3:06 (a missed clock-out must never create overtime); the office corrects the real finish time by hand.
- Employer backfill: each existing employee's employer was set to the company they have the most attendance with since 1 September (else their first company). Check Employees → Employer column and correct any.
- Approver backfill: active accounts named Robbie, Mitch/Mitchell, Chris Wynne, Terance/Terry. Chanelle is not flagged (view only). Change under Employees → Edit → "Can approve overtime".
- Flat-rate workers (director setting) are paid every hour at their rate: no cap, no overtime, no break deduction change.

## One decision to make before the first pay run under the new rules

Audited on live approved attendance (read-only, 9–22 Oct): every employee-day follows the rules and totals reconcile — 443.6 h worked − 24.5 h breaks − 20.4 h overtime awaiting approval = 398.7 h paid. But 34 of the 51 days have *some* unapproved overtime, mostly a few minutes: workers clock out at 3:08–3:20 pm, so an 8.12 h day leaves 0.02 h (1 minute) "pending and unpaid" and the Overtime page fills with tiny requests. The larger ones are real (Mitchell Baldry 3.3 h on 13 Oct and 3.27 h on 15 Oct, Lane Heppell 2.07 h on 13 Oct). The rule as written is applied literally. If Build One would rather ignore small overruns (for example, under 15 minutes counts as the standard day), say the number and it is a one-line change in the engine; otherwise nothing changes.

## What changes for existing data

- Pay runs created before this change used 8 h regular and paid unapproved overtime at the ordinary rate. From now on, Recalculate on a run applies 7.6 h and holds unapproved overtime as unpaid. Approve the pending requests on the Overtime page before recalculating the current runs.
- Existing overtime requests have no approver recorded (they pre-date the picker); any flagged approver can decide them.

## Files

- Database: `supabase/migrations/0031_build_one_rules.sql` (and `0030_pay_rate_baselines.sql` from 19 Oct, still to run).
- Admin: pay engine `admin/lib/labour-cost.ts`; payroll run `admin/lib/payroll-run.ts`; reports page, filter and exports (`admin/lib/report-rows.ts`, `/api/reports/csv`, `/api/reports/xlsx`); timesheet exports (`/api/timesheets/export`, `admin/lib/timesheets-pdf.tsx`); Overtime page gating; Employees (employer, approver); Entities pay settings; Attendance (approver info, downloads, auto marker); pay run page / CSV / PDF (overtime awaiting approval).
- Mobile 7.7: overtime request with approver (`components/overtime-request-form.tsx`, Home), Approvals screen (`app/(app)/approvals.tsx`), push Approve/Reject buttons (`lib/push.ts`), reminders (`lib/notify.ts`), history shows approver, offline queue carries the approver.

## Test status (21 Oct 2026)

- Engine unit tests (break, cap, pending/approved overtime, weekend, 7:00–3:06 day, hours by project, employer grouping): 37 of 37 pass. Pay-rate tests pass. Offline unit tests pass. Admin and mobile type-check clean; admin production build clean; Metro bundle builds.
- Live database (migration 0031 applied): 16 of 16 — approver list, permission checks (a worker cannot flag themselves or move employer; a non-approver cannot decide), request raised while on the clock → approver's push row with the request id → approve → worker notified → clock-out links the timesheet with overtime approved; approval after clock-out by a non-admin approver on attendance already approved; overnight fallback closes a forgotten session as 7:00–3:06 (8.1 h = 7.6 h paid), marked auto, worker told; the 3:06 pm job runs (time-guarded).
- Admin, production build: 12 of 12 — fixed rules on Entities and only multipliers editable (saved config = 7.6 / 9.6 / 30 min at 5 h / approval on); Employer column, approver badge and edit-form fields; Overtime page read-only for a non-approver; Reports tabs, pay-period picker, Hours by Project and Approved Overtime with CSV + Excel (TV7 export has no dollar column); Attendance download links and timesheet exports (Excel / PDF / CSV, all or one employee); pay run entries carry overtime awaiting approval and only the employer's staff appear on a company's run.
- Admin responsive pass (phone 390, tablet 768, desktop 1440): all eight changed pages fit with no horizontal page scroll; tables scroll inside their cards.
- Live payroll audit (read-only, 9–22 Oct and 25 Sep – 8 Oct): every employee-day follows the rules; totals reconcile (see the decision above about minutes of overtime).
- On device, mobile 7.7 preview build on the Pixel 10 Pro emulator against the live project: worker clocks in → "Overtime today?" → reason → picks the approver → "Send request now" → "Waiting for TV Approver" (request and approver push row in the database) → approver signs in, Home shows "1 overtime request to approve", Approvals screen → Approve → confirm → recorded with the approver and time, worker notified → worker signs in, card reads "Approved by TV Approver" → Clock Out → timesheet linked, overtime approved → My Timesheets shows "Approved by TV Approver". Test accounts removed afterwards.
- Not observable before go-live: the 3:06 pm weekday job on a real afternoon (its SQL is the same shape as the overnight job, which was tested), the push's Approve/Reject buttons on a physical phone (the emulator has no push token; the category and handler are in the build), and weekend quiet (it is a weekday).
