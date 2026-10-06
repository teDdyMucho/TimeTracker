-- Since 0024 the DB creates a timesheet for every clock session (trigger
-- trg_session_sync_timesheet, row linked via timesheets.clock_session_id).
-- Two older writers still insert their own, UNLINKED timesheet on clock-out:
--   • the mobile app's writeClockOut (every build up to 7.3 in the field)
--   • auto_clock_out_stale_sessions() (server cron)
-- so every clock-out since 5 Oct 2026 produced two rows and payroll doubled
-- (ARKO 6 Oct: 50.6h of attendance → 101.3h of timesheets).
--
-- Fix, in three parts:
--   1. BEFORE INSERT guard on timesheets: an unlinked insert that duplicates a
--      session-linked timesheet (same worker/day/entity/project, same hours)
--      ADOPTS that session — the trigger's row is removed and the incoming row
--      takes its clock_session_id. The insert still returns a row, so the old
--      app's `.insert().select().single()` keeps working, and later approve /
--      edit on the session flows to this row through the ON CONFLICT upsert.
--   2. auto_clock_out_stale_sessions() no longer inserts timesheets — closing
--      the session is enough, the sync trigger does the rest.
--   3. Delete the twins already created.

-- ── 1. Guard: absorb legacy unlinked inserts ──────────────────────────────────
create or replace function public.adopt_session_for_legacy_timesheet()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sess_id uuid;
begin
  if new.clock_session_id is not null then
    return new; -- written by the sync trigger itself
  end if;

  -- A closed session for the same worker/day/entity/project whose duration
  -- (rounded to the minute, as both writers do) equals the incoming hours.
  select cs.id into sess_id
    from clock_sessions cs
    join timesheets t on t.clock_session_id = cs.id
   where cs.profile_id = new.profile_id
     and cs.work_date = new.work_date
     and cs.business_entity_id = new.business_entity_id
     and cs.project_id is not distinct from new.project_id
     and cs.clocked_out_at is not null
     and abs(round(extract(epoch from (cs.clocked_out_at - cs.clocked_in_at)) / 60.0) / 60.0 - new.hours) < 0.011
     and t.status <> 'locked'
   order by cs.clocked_out_at desc
   limit 1;

  if sess_id is null then
    return new; -- a genuine manual timesheet (no matching clock-in) — keep as is
  end if;

  -- Hand the session over to the incoming row: drop the trigger's copy and link
  -- this one instead, carrying over the review status already on the session.
  delete from timesheets where clock_session_id = sess_id;
  new.clock_session_id := sess_id;
  select case when cs.review_status = 'approved' then 'approved'::timesheet_status else new.status end
    into new.status
    from clock_sessions cs where cs.id = sess_id;
  return new;
end $$;

drop trigger if exists trg_timesheet_adopt_session on public.timesheets;
create trigger trg_timesheet_adopt_session
  before insert on public.timesheets
  for each row execute function public.adopt_session_for_legacy_timesheet();

-- ── 2. Server auto clock-out: close the session only ─────────────────────────
create or replace function public.auto_clock_out_stale_sessions(max_hours numeric default 16)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  closed_count integer;
begin
  with closed as (
    -- Closing the session is all that's needed: trg_session_sync_timesheet
    -- writes the (single) timesheet for it.
    update public.clock_sessions cs
       set clocked_out_at = cs.clocked_in_at + interval '1 hour' * max_hours
     where cs.clocked_out_at is null
       and cs.clocked_in_at <= now() - interval '1 hour' * max_hours
    returning cs.profile_id
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

-- ── 3. Remove the twins already written ──────────────────────────────────────
-- An unlinked, non-locked timesheet is a twin when a session-linked timesheet
-- exists for the same worker/day/entity/project with the same hours.
with twins as (
  select u.id
    from timesheets u
    join timesheets l
      on l.clock_session_id is not null
     and l.profile_id = u.profile_id
     and l.work_date = u.work_date
     and l.business_entity_id = u.business_entity_id
     and l.project_id is not distinct from u.project_id
     and abs(l.hours - u.hours) < 0.011
   where u.clock_session_id is null
     and u.status <> 'locked'
     and u.created_at >= '2026-10-05' -- the sync trigger went live on 5 Oct 2026
)
delete from timesheets where id in (select id from twins);

-- Report: should be 0 unlinked, non-locked rows left for dates since 5 Oct 2026.
select count(*) as unlinked_left
  from timesheets
 where clock_session_id is null and status <> 'locked' and work_date >= '2026-10-05';
