-- Raise the forgotten-clock-out limit from 12h to 16h (client request, 18 Sep
-- 2026: "extend this limit to 16 hours"). Keep in step with
-- AUTO_CLOCK_OUT_HOURS in mobile/lib/queries.ts.
--
-- Behaviour is unchanged otherwise: a session left open past the limit is
-- closed at clock-in + 16h and logs one 16-hour shift, never the real elapsed
-- time, so payroll can't receive a 30-hour day.

create or replace function public.auto_clock_out_stale_sessions(max_hours numeric default 16)
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

revoke all on function public.auto_clock_out_stale_sessions(numeric) from public, anon, authenticated;
