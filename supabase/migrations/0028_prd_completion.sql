-- PRD completion pass (14 Oct 2026). Closes the database-side gaps listed in
-- PRD-Compliance-Report-2026-10-14.md:
--   1. pay_config gains `overtimeRequiresApproval` (PRD §10 — approval drives pay).
--   2. Realtime publication for the live dashboard (PRD §5).
--   3. audit_logs is actually written (PRD §20) — row-change triggers on the
--      money / configuration tables.
--   4. Server-side missing-timesheet reminder (PRD §18) via pg_cron.
--   5. RLS hardening found during the review: employees can no longer
--      self-approve timesheets, attendance or leave, or post as the office.
--   6. settings.pay_cycle / labour_cost_alert seeded if absent (PRD §15, §18).

-- ── 1. Overtime approval gate ─────────────────────────────────────────────────
-- Default OFF so live payroll figures do not change until an admin switches it
-- on per entity (Entities → Pay settings). When ON, weekday hours past the
-- ordinary band are paid at the ordinary rate unless that day's overtime
-- request was approved. Weekend / public-holiday loading is a day-type rate and
-- is unaffected.
update public.business_entities
   set pay_config = pay_config || jsonb_build_object('overtimeRequiresApproval', false)
 where not (pay_config ? 'overtimeRequiresApproval');

alter table public.business_entities
  alter column pay_config set default jsonb_build_object(
    'standardDailyHours', 8,
    'weekdayTiers', jsonb_build_array(
      jsonb_build_object('band','regular','fromHour',0,'toHour',8,'multiplier',1.0),
      jsonb_build_object('band','overtime_t1','fromHour',8,'toHour',10,'multiplier',1.5),
      jsonb_build_object('band','overtime_t2','fromHour',10,'toHour',null,'multiplier',2.0)
    ),
    'saturdayMultiplier', 1.5,
    'sundayMultiplier', 2.0,
    'publicHolidayMultiplier', 2.5,
    'overtimeRequiresApproval', false
  );

-- ── 2. Realtime for the admin dashboard ───────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['timesheets','clock_sessions','overtime_requests','leave_requests','messages','notifications','payroll_runs']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── 3. audit_logs — written by trigger ────────────────────────────────────────
-- actor_id is auth.uid() for a JWT write; null for service-role writes from the
-- admin app.
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
  payload jsonb;
begin
  if tg_op = 'DELETE' then
    rid := old.id::text;
    payload := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    rid := new.id::text;
    payload := jsonb_build_object('new', to_jsonb(new));
  else
    rid := new.id::text;
    payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, detail)
  values (auth.uid(), lower(tg_op), tg_table_name, rid, payload);
  return coalesce(new, old);
exception when others then
  raise warning 'log_audit failed on %: %', tg_table_name, sqlerrm;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['pay_rates','payroll_runs','payroll_entries','project_financials','business_entities','projects','profiles','public_holidays','settings']
  loop
    execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
    execute format('create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.log_audit()', t, t);
  end loop;
end $$;

create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_table_row on public.audit_logs(table_name, row_id);

-- ── 4. Missing-timesheet reminder (PRD §18) ───────────────────────────────────
-- Runs hourly; acts only when it is 17:00 in Melbourne on a weekday, and only
-- once per day (guarded by an existing reminder row for that date). Workers
-- with no clock session today and no approved leave covering today get a push;
-- admins and supervisors get one summary naming who is missing.
create or replace function public.remind_missing_timesheets()
returns integer language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := (now() at time zone 'Australia/Melbourne');
  local_day date := local_now::date;
  missing_count integer := 0;
  names text;
begin
  if extract(hour from local_now) <> 17 then return 0; end if;
  if extract(isodow from local_now) > 5 then return 0; end if;

  -- Already sent today?
  if exists (
    select 1 from public.notifications
     where type = 'timesheet_missing'
       and (created_at at time zone 'Australia/Melbourne')::date = local_day
  ) then
    return 0;
  end if;

  with missing as (
    select p.id, p.name
      from public.profiles p
     where p.status = 'active'
       and p.role = 'employee'
       and not exists (select 1 from public.clock_sessions cs where cs.profile_id = p.id and cs.work_date = local_day)
       and not exists (
         select 1 from public.leave_requests lr
          where lr.profile_id = p.id and lr.status = 'approved'
            and lr.start_date <= local_day and lr.end_date >= local_day
       )
  ),
  worker_notif as (
    insert into public.notifications (profile_id, type, title, body)
    select id, 'timesheet_missing', 'No hours logged today',
           'We have no clock-in for you today. If you worked, clock in and out now or tell your supervisor.'
      from missing
    returning profile_id
  )
  select count(*), string_agg(name, ', ' order by name) into missing_count, names from missing;

  if missing_count > 0 then
    insert into public.notifications (profile_id, type, title, body)
    select id, 'timesheet_missing_team',
           format('%s worker%s with no hours today', missing_count, case when missing_count = 1 then '' else 's' end),
           'No clock-in today from: ' || names
      from public.profiles
     where status = 'active' and role in ('admin', 'supervisor');
  end if;

  return missing_count;
end $$;

revoke all on function public.remind_missing_timesheets() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'remind-missing-timesheets';
select cron.schedule(
  'remind-missing-timesheets',
  '5 * * * *',
  $job$select public.remind_missing_timesheets();$job$
);

-- ── 5. RLS hardening ──────────────────────────────────────────────────────────
-- 5a. Employees may not approve their own timesheet / overtime.
create or replace function public.guard_timesheet_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if; -- service role / admin
  if public.is_supervisor_of(new.profile_id) then
    -- A supervisor may approve, but never alter the hours of a team member.
    if tg_op = 'UPDATE' and (new.hours is distinct from old.hours or new.work_date is distinct from old.work_date) then
      raise exception 'supervisors cannot change hours';
    end if;
    return new;
  end if;
  if new.status not in ('submitted') then
    raise exception 'not authorised to set timesheet status';
  end if;
  if new.overtime_status not in ('none', 'pending') then
    raise exception 'not authorised to set overtime status';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_timesheet_write on public.timesheets;
create trigger trg_guard_timesheet_write before insert or update on public.timesheets
  for each row execute function public.guard_timesheet_write();

-- 5b. Employees may not approve their own attendance.
create or replace function public.guard_clock_session_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if public.is_supervisor_of(new.profile_id) then return new; end if;
  if tg_op = 'INSERT' and new.review_status is distinct from 'pending' then
    raise exception 'not authorised to set attendance review status';
  end if;
  if tg_op = 'UPDATE' and new.review_status is distinct from old.review_status then
    raise exception 'not authorised to change attendance review status';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_clock_session_write on public.clock_sessions;
create trigger trg_guard_clock_session_write before insert or update on public.clock_sessions
  for each row execute function public.guard_clock_session_write();

-- 5c. Leave must be submitted as pending; messages from a worker are always
--     marked as from the worker.
drop policy if exists leave_own_insert on public.leave_requests;
create policy leave_own_insert on public.leave_requests for insert to authenticated
  with check (profile_id = auth.uid() and status = 'pending' and public.is_active_user());

drop policy if exists msg_own_insert on public.messages;
create policy msg_own_insert on public.messages for insert to authenticated
  with check (profile_id = auth.uid() and sender_id = auth.uid() and sender_role = 'employee' and public.is_active_user());

-- 5d. Supervisors can see their team's leave and attendance (PRD §4).
drop policy if exists leave_team_read on public.leave_requests;
create policy leave_team_read on public.leave_requests for select to authenticated
  using (public.is_supervisor_of(profile_id));

drop policy if exists cs_team_read on public.clock_sessions;
create policy cs_team_read on public.clock_sessions for select to authenticated
  using (public.is_supervisor_of(profile_id));

-- 5e. Profile guard also protects pay-affecting fields.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.role            is distinct from old.role
     or new.supervisor_id   is distinct from old.supervisor_id
     or new.business_access is distinct from old.business_access
     or new.status          is distinct from old.status
     or new.email           is distinct from old.email
     or new.flat_rate       is distinct from old.flat_rate
     or new.employment_type is distinct from old.employment_type then
    raise exception 'not authorised to change role/access/pay fields';
  end if;
  return new;
end $$;

-- 5f. Fan-out helper is for triggers only, not for RPC.
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;

-- ── 6. Settings ───────────────────────────────────────────────────────────────
insert into public.settings (key, value)
values ('pay_cycle', jsonb_build_object('frequency', 'fortnightly', 'anchorStart', '2026-09-25'))
on conflict (key) do nothing;

insert into public.settings (key, value)
values ('labour_cost_alert', jsonb_build_object('enabled', true, 'thresholdPct', 100))
on conflict (key) do nothing;
