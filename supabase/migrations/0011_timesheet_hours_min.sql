-- Allow true elapsed time on timesheets (was a hard 30-minute minimum).
-- Clock-in/out now records the real worked time down to the minute.
alter table public.timesheets drop constraint if exists timesheets_hours_check;
alter table public.timesheets
  add constraint timesheets_hours_check check (hours > 0 and hours <= 24);
