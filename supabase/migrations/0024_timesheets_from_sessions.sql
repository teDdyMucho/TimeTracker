-- The timesheet must always be correct, because payroll computes from it.
--
-- Audit of pay period 25 Sep – 8 Oct 2026 found the two tables disagreed for
-- 7 of 11 workers, payroll always LOWER:
--   * Add Attendance in the admin created a clock_session only, never a
--     timesheet — 7 days (~65h) existed on the timesheet PDF but were invisible
--     to payroll (Mitchell 28+29 Sep, Lane 29+30 Sep, Ronald, Lachlan, Cooper).
--   * Some timesheets held hours that no longer matched their session after the
--     times were corrected (William 8.10h session vs a 0.02h timesheet).
--   * The old 16h auto clock-out wrote a timesheet unrelated to any session
--     (Mitchell 2 Oct: 8.83h of sessions, 18.83h of timesheets).
--
-- Fix: a clock session is now the single source of truth. Every closed session
-- owns exactly one timesheet, kept in step by trigger — however the session was
-- created (app clock-out, admin Add Attendance) or later edited.

alter table public.timesheets
  add column if not exists clock_session_id uuid references public.clock_sessions(id) on delete cascade;

-- One timesheet per session.
create unique index if not exists uq_timesheets_clock_session
  on public.timesheets(clock_session_id) where clock_session_id is not null;

create index if not exists idx_timesheets_session on public.timesheets(clock_session_id);

/**
 * Keep a session's timesheet in step with the session itself.
 * - open session (no clock-out)  → no timesheet
 * - rejected attendance          → no timesheet (those hours are not paid)
 * - otherwise                    → one timesheet of exactly the worked hours
 * Hours are the true elapsed time, rounded to the minute and capped at 24h.
 */
create or replace function public.sync_timesheet_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  worked numeric;
begin
  if new.clocked_out_at is null or new.review_status = 'rejected' then
    delete from timesheets where clock_session_id = new.id;
    return new;
  end if;

  worked := round(extract(epoch from (new.clocked_out_at - new.clocked_in_at)) / 60.0) / 60.0;
  worked := least(greatest(worked, 0.02), 24);

  insert into timesheets (
    clock_session_id, profile_id, work_date, business_entity_id, project_id,
    work_location, hours, overtime_requested, overtime_reason, overtime_status, status
  )
  values (
    new.id, new.profile_id, new.work_date, new.business_entity_id, new.project_id,
    new.work_location, worked, coalesce(new.overtime_requested, false), new.overtime_reason,
    case when coalesce(new.overtime_requested, false) then 'pending'::overtime_status else 'none'::overtime_status end,
    case when new.review_status = 'approved' then 'approved'::timesheet_status else 'submitted'::timesheet_status end
  )
  on conflict (clock_session_id) where clock_session_id is not null do update set
    work_date          = excluded.work_date,
    business_entity_id = excluded.business_entity_id,
    project_id         = excluded.project_id,
    work_location      = excluded.work_location,
    hours              = excluded.hours,
    -- A locked timesheet belongs to a finished pay run; never move it.
    status             = case when timesheets.status = 'locked' then timesheets.status else excluded.status end,
    updated_at         = now();

  return new;
exception when others then
  raise warning 'sync_timesheet_from_session(%): %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_session_sync_timesheet on public.clock_sessions;
create trigger trg_session_sync_timesheet
  after insert or update of clocked_in_at, clocked_out_at, review_status,
                            work_date, project_id, business_entity_id, work_location
  on public.clock_sessions
  for each row execute function public.sync_timesheet_from_session();
