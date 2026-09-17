-- Server-side auto clock-out (safety net for the mobile app's own auto clock-out).
--
-- The app only auto-closes a forgotten session while it is open and signed in.
-- If the worker signs out, loses the phone, or simply never reopens the app, the
-- session stayed open forever and no timesheet was ever written — the hours
-- were lost. This job closes those sessions on the server instead.
--
-- Same rule as the app (mobile/lib/queries.ts AUTO_CLOCK_OUT_HOURS): the shift
-- is CAPPED at clock-in + 12h, never the real elapsed time, so a session left
-- open for days still logs one 12-hour shift on its original work_date.

create extension if not exists pg_cron;

create or replace function public.auto_clock_out_stale_sessions(max_hours numeric default 12)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  closed_count integer;
begin
  with closed as (
    -- Atomic: only rows this statement actually closes get a timesheet, so a
    -- session the app closed a moment earlier is never logged twice.
    update public.clock_sessions cs
       set clocked_out_at = cs.clocked_in_at + interval '1 hour' * max_hours
     where cs.clocked_out_at is null
       and cs.clocked_in_at <= now() - interval '1 hour' * max_hours
    returning cs.profile_id, cs.work_date, cs.business_entity_id, cs.project_id, cs.work_location
  ),
  ts as (
    insert into public.timesheets (
      profile_id, work_date, business_entity_id, project_id, work_location,
      hours, overtime_requested, overtime_reason, overtime_status, status
    )
    -- Overtime is never auto-requested — the worker didn't confirm it.
    select profile_id, work_date, business_entity_id, project_id, work_location,
           max_hours, false, null, 'none', 'submitted'
      from closed
    returning 1
  ),
  notif as (
    insert into public.notifications (profile_id, type, title, body)
    select profile_id,
           'auto_clock_out',
           'Automatically clocked out',
           format(
             'You reached %s hours on the clock, so we clocked you out and logged a %s-hour shift. If you kept working, tell your supervisor.',
             max_hours, max_hours
           )
      from closed
    returning 1
  )
  select count(*) into closed_count from closed;

  return closed_count;
end;
$$;

-- security definer: only the scheduler / service role may run it.
revoke all on function public.auto_clock_out_stale_sessions(numeric) from public, anon, authenticated;

-- Nightly at 00:00 Australia/Brisbane. pg_cron runs in UTC and Brisbane has no
-- daylight saving (always UTC+10), so midnight Brisbane = 14:00 UTC.
select cron.unschedule(jobid) from cron.job where jobname = 'auto-clock-out-nightly';
select cron.schedule(
  'auto-clock-out-nightly',
  '0 14 * * *',
  $$select public.auto_clock_out_stale_sessions();$$
);
