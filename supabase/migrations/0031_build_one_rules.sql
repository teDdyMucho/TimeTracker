-- Build One rules (20 Oct 2026) — Robbie's list TV1–TV11. Safe to re-run.
--
--   TV3  Overtime approval by a chosen approver (Robbie / Mitch / Chris / Terry),
--        push with Approve/Reject, approver name + time recorded, Chanelle
--        view-only. profiles.overtime_approver; overtime_requests.supervisor_id
--        is the chosen approver; requests can be raised while still on the
--        clock (overtime_requests.clock_session_id) and are linked to the
--        timesheet when the session closes.
--   TV6  Wages go to the employee's own employer: profiles.employer_entity_id.
--   TV8  No pushes on Saturday / Sunday except overtime approval traffic.
--   TV9  3:06 pm auto clock-out recorded as 7:00 am – 3:06 pm (= 7.6 h after
--        the 30 min break, never overtime); nightly fallback never creates
--        overtime either. clock_sessions.auto_closed marks them for review.
--   TV1 / TV2 (30 min break on days of 5 h or more; 7.6 h regular cap) are
--        fixed in the app's pay engine — nothing to store.

-- ── 1. profiles ───────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists employer_entity_id uuid references public.business_entities(id);
alter table public.profiles add column if not exists overtime_approver boolean not null default false;
create index if not exists idx_profiles_employer on public.profiles(employer_entity_id);

-- Employer backfill: the company the person has the most attendance with since
-- 1 Sep 2026, else the first company they have access to. Admins can change
-- it in Employees → Edit → "Employer (payroll)".
update public.profiles p
   set employer_entity_id = coalesce(
     (select t.business_entity_id
        from public.timesheets t
       where t.profile_id = p.id and t.work_date >= date '2026-09-01'
       group by t.business_entity_id
       order by count(*) desc, max(t.work_date) desc
       limit 1),
     p.business_access[1])
 where p.employer_entity_id is null;

-- Approver backfill: Robbie, Mitch, Chris, Terry (active accounts only).
update public.profiles
   set overtime_approver = true
 where status = 'active'
   and (name ilike 'robbie %' or name ilike 'mitch %' or name ilike 'mitchell %'
        or name ilike 'chris wynne%' or name ilike 'terance %' or name ilike 'terry %');

-- Workers must not be able to make themselves an approver or move employer.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.role               is distinct from old.role
     or new.supervisor_id      is distinct from old.supervisor_id
     or new.business_access    is distinct from old.business_access
     or new.status             is distinct from old.status
     or new.email              is distinct from old.email
     or new.flat_rate          is distinct from old.flat_rate
     or new.employment_type    is distinct from old.employment_type
     or new.employer_entity_id is distinct from old.employer_entity_id
     or new.overtime_approver  is distinct from old.overtime_approver then
    raise exception 'not authorised to change role/access/pay fields';
  end if;
  return new;
end;
$$;

-- The timesheet written by the clock-session sync trigger carries the overtime
-- status decided by the approver. That write happens inside the WORKER's
-- clock-out statement, so the 0028 self-approval guard must recognise it as a
-- system write (the sync trigger sets a transaction-local flag) rather than
-- the worker setting their own overtime status.
create or replace function public.guard_timesheet_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if; -- service role / admin
  if current_setting('timevera.sync_write', true) = 'on' then return new; end if; -- clock-session sync trigger
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

-- ── 2. overtime_requests: raised while on the clock, linked on clock-out ──────
alter table public.overtime_requests alter column timesheet_id drop not null;
alter table public.overtime_requests add column if not exists clock_session_id uuid references public.clock_sessions(id) on delete cascade;
create index if not exists idx_overtime_session on public.overtime_requests(clock_session_id);
create index if not exists idx_overtime_approver_status on public.overtime_requests(supervisor_id, status);

-- ── 3. clock_sessions: auto-closed marker ─────────────────────────────────────
alter table public.clock_sessions add column if not exists auto_closed boolean not null default false;

-- ── 4. notifications: payload for push actions ────────────────────────────────
alter table public.notifications add column if not exists data jsonb;

-- ── 5. Timesheet sync: also link / reflect an overtime request raised earlier ──
create or replace function public.sync_timesheet_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  worked numeric;
  req record;
begin
  if new.clocked_out_at is null or new.review_status = 'rejected' then
    delete from timesheets where clock_session_id = new.id;
    return new;
  end if;

  worked := round(extract(epoch from (new.clocked_out_at - new.clocked_in_at)) / 60.0) / 60.0;
  worked := least(greatest(worked, 0.02), 24);

  -- Mark this transaction's timesheet write as the system's (see guard_timesheet_write).
  perform set_config('timevera.sync_write', 'on', true);

  -- A request raised during the day (before clock-out) for this session.
  select * into req from overtime_requests
   where clock_session_id = new.id
   order by created_at desc limit 1;

  insert into timesheets (
    clock_session_id, profile_id, work_date, business_entity_id, project_id,
    work_location, hours, overtime_requested, overtime_reason, overtime_status, status
  )
  values (
    new.id, new.profile_id, new.work_date, new.business_entity_id, new.project_id,
    new.work_location, worked,
    coalesce(new.overtime_requested, false) or req.id is not null,
    coalesce(req.reason, new.overtime_reason),
    case
      when req.id is not null then req.status
      when coalesce(new.overtime_requested, false) then 'pending'::overtime_status
      else 'none'::overtime_status
    end,
    case when new.review_status = 'approved' then 'approved'::timesheet_status else 'submitted'::timesheet_status end
  )
  on conflict (clock_session_id) where clock_session_id is not null do update set
    work_date          = excluded.work_date,
    business_entity_id = excluded.business_entity_id,
    project_id         = excluded.project_id,
    work_location      = excluded.work_location,
    hours              = excluded.hours,
    -- Overtime fields only move forward from "none"; a decision already made stays.
    overtime_requested = timesheets.overtime_requested or excluded.overtime_requested,
    overtime_reason    = coalesce(timesheets.overtime_reason, excluded.overtime_reason),
    overtime_status    = case when timesheets.overtime_status = 'none' then excluded.overtime_status else timesheets.overtime_status end,
    status             = case when timesheets.status = 'locked' then timesheets.status else excluded.status end,
    updated_at         = now();

  -- Point the request at its timesheet so approvals update the right row.
  if req.id is not null then
    update overtime_requests o
       set timesheet_id = t.id
      from timesheets t
     where o.id = req.id and t.clock_session_id = new.id and o.timesheet_id is null;
  end if;

  return new;
exception when others then
  raise warning 'sync_timesheet_from_session(%): %', new.id, sqlerrm;
  return new;
end $$;

-- ── 6. Push: quiet at weekends, carries the action payload ───────────────────
create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tok text; enabled boolean;
  local_dow int := extract(isodow from (now() at time zone 'Australia/Melbourne'));
  payload jsonb;
begin
  -- TV8: nothing on Saturday or Sunday, except overtime approval traffic.
  if local_dow in (6, 7) and new.type not in ('overtime_request', 'overtime_approved', 'overtime_rejected') then
    return new;
  end if;
  select expo_push_token, notifications_enabled into tok, enabled
    from profiles where id = new.profile_id;
  if tok is null or enabled = false
     or (tok not like 'ExponentPushToken%' and tok not like 'ExpoPushToken%') then
    return new;
  end if;
  payload := jsonb_build_object(
    'to', tok, 'title', new.title, 'body', coalesce(new.body, ''),
    'sound', 'default', 'priority', 'high', 'channelId', 'default',
    'data', coalesce(new.data, '{}'::jsonb) || jsonb_build_object('type', new.type, 'notificationId', new.id)
  );
  -- Approve / Reject buttons on the phone (the app registers this category).
  if new.type = 'overtime_request' then
    payload := payload || jsonb_build_object('categoryId', 'overtime_approval');
  end if;
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := payload,
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'notify_push failed: %', sqlerrm;
  return new;
end $$;

-- ── 7. New overtime request → the chosen approver (fallback: every approver) ──
create or replace function public.on_overtime_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text; d date; t text;
begin
  select name into who from profiles where id = new.profile_id;
  select work_date into d from timesheets where id = new.timesheet_id;
  if d is null then select work_date into d from clock_sessions where id = new.clock_session_id; end if;
  t := format('Overtime request from %s', coalesce(who, 'a worker'));
  if new.supervisor_id is not null then
    insert into notifications (profile_id, type, title, body, data)
    values (new.supervisor_id, 'overtime_request', t,
            left(format('%s — %s', coalesce(to_char(d, 'DD Mon'), 'today'), coalesce(new.reason, '')), 180),
            jsonb_build_object('requestId', new.id));
  elsif exists (select 1 from profiles where overtime_approver and status = 'active') then
    insert into notifications (profile_id, type, title, body, data)
    select id, 'overtime_request', t,
           left(format('%s — %s', coalesce(to_char(d, 'DD Mon'), 'today'), coalesce(new.reason, '')), 180),
           jsonb_build_object('requestId', new.id)
      from profiles where overtime_approver and status = 'active';
  else
    perform notify_admins('overtime', t, left(coalesce(new.reason, ''), 140));
  end if;
  return new;
exception when others then raise warning 'on_overtime_request: %', sqlerrm; return new;
end $$;

drop trigger if exists trg_overtime_notify_admins on public.overtime_requests;
create trigger trg_overtime_notify_admins after insert on public.overtime_requests
  for each row execute function public.on_overtime_request();

-- ── 8. RPCs for the phone ─────────────────────────────────────────────────────
-- Who a worker can send an overtime request to.
create or replace function public.list_overtime_approvers()
returns table (id uuid, name text)
language sql security definer stable set search_path = public as $$
  select id, name from public.profiles
   where overtime_approver = true and status = 'active'
   order by name;
$$;
grant execute on function public.list_overtime_approvers() to authenticated;

-- Pending requests addressed to the signed-in approver (with the worker's name).
create or replace function public.list_my_overtime_approvals()
returns table (
  id uuid, profile_id uuid, worker_name text, work_date date, hours numeric,
  project_name text, reason text, status overtime_status, created_at timestamptz, still_on_clock boolean
)
language sql security definer stable set search_path = public as $$
  select o.id, o.profile_id, p.name, coalesce(t.work_date, s.work_date), t.hours,
         coalesce(pt.name, ps.name), o.reason, o.status, o.created_at, (s.id is not null and s.clocked_out_at is null)
    from public.overtime_requests o
    join public.profiles p on p.id = o.profile_id
    left join public.timesheets t on t.id = o.timesheet_id
    left join public.projects pt on pt.id = t.project_id
    left join public.clock_sessions s on s.id = o.clock_session_id
    left join public.projects ps on ps.id = s.project_id
   where o.supervisor_id = auth.uid() and o.status = 'pending'
     and exists (select 1 from public.profiles me where me.id = auth.uid() and me.overtime_approver and me.status = 'active')
   order by o.created_at desc;
$$;
grant execute on function public.list_my_overtime_approvals() to authenticated;

-- Approve / reject (from the push buttons or the Approvals screen).
create or replace function public.decide_overtime_request(p_request uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r record; can boolean; who text; d date;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select overtime_approver into can from profiles where id = me and status = 'active';
  if can is distinct from true then raise exception 'Only an overtime approver can decide requests'; end if;
  select * into r from overtime_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided'; end if;

  update overtime_requests
     set status = p_decision::overtime_status, decided_by = me, decided_at = now()
   where id = p_request;
  if r.timesheet_id is not null then
    -- The approver is authorised above; the timesheet write is the system's
    -- (the 0028 guard would otherwise refuse a non-admin setting 'approved').
    perform set_config('timevera.sync_write', 'on', true);
    update timesheets set overtime_status = p_decision::overtime_status where id = r.timesheet_id;
    select work_date into d from timesheets where id = r.timesheet_id;
  else
    select work_date into d from clock_sessions where id = r.clock_session_id;
  end if;

  select name into who from profiles where id = me;
  insert into notifications (profile_id, type, title, body)
  values (r.profile_id,
          case when p_decision = 'approved' then 'overtime_approved' else 'overtime_rejected' end,
          case when p_decision = 'approved' then 'Overtime approved' else 'Overtime declined' end,
          format('%s %s your overtime request for %s.', coalesce(who, 'Your approver'),
                 case when p_decision = 'approved' then 'approved' else 'declined' end,
                 coalesce(to_char(d, 'DD Mon'), 'today')));
end $$;
grant execute on function public.decide_overtime_request(uuid, text) to authenticated;

-- ── 9. 3:06 pm auto clock-out (TV9) ──────────────────────────────────────────
-- Anyone still clocked in at 3:06 pm Melbourne on a weekday with no overtime
-- request for that session is recorded as 7:00 am – 3:06 pm (8 h 06 m, which is
-- 7.6 h after the 30 min break: a standard day, never overtime).
create or replace function public.auto_clock_out_afternoon()
returns integer language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := (now() at time zone 'Australia/Melbourne');
  local_day date := local_now::date;
  n integer := 0;
begin
  if extract(isodow from local_now) > 5 then return 0; end if;
  if extract(hour from local_now) <> 15 or extract(minute from local_now) < 6 then return 0; end if;

  with closed as (
    update clock_sessions cs
       set clocked_in_at  = (cs.work_date + time '07:00') at time zone 'Australia/Melbourne',
           clocked_out_at = (cs.work_date + time '15:06') at time zone 'Australia/Melbourne',
           auto_closed    = true
     where cs.clocked_out_at is null
       and cs.work_date <= local_day
       and cs.clocked_in_at < (local_day + time '15:06') at time zone 'Australia/Melbourne'
       and not exists (
         select 1 from overtime_requests o
          where o.clock_session_id = cs.id and o.status in ('pending', 'approved'))
    returning cs.profile_id
  ),
  notif as (
    insert into notifications (profile_id, type, title, body)
    select profile_id, 'auto_clock_out', 'Automatically clocked out',
           'You were still clocked in at 3:06 pm with no overtime request, so today was recorded as 7:00 am to 3:06 pm. If you did work overtime, ask the office to adjust it.'
      from closed
    returning 1
  )
  select count(*) into n from closed;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'auto-clock-out-afternoon';
-- 15:06 Melbourne is 04:06 UTC in daylight saving and 05:06 UTC otherwise; the
-- function's local-time guard makes the other call a no-op. :16 is a retry.
select cron.schedule('auto-clock-out-afternoon', '6,16 4,5 * * 1-5', $job$select public.auto_clock_out_afternoon();$job$);

-- Nightly fallback (existing job name): whatever is still open — including a
-- session that had an overtime request but no clock-out — is closed as a
-- standard 7:00 am – 3:06 pm day. A missed clock-out never creates overtime;
-- the office corrects real overtime by hand (the row is marked auto-closed).
create or replace function public.auto_clock_out_stale_sessions(max_hours numeric default 16)
returns integer language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := (now() at time zone 'Australia/Melbourne');
  n integer := 0;
begin
  with closed as (
    update clock_sessions cs
       set clocked_in_at  = case
                              -- clocked in after 3:06 pm (evening work): keep the real start, close a minute later
                              when cs.clocked_in_at >= (cs.work_date + time '15:06') at time zone 'Australia/Melbourne' then cs.clocked_in_at
                              else (cs.work_date + time '07:00') at time zone 'Australia/Melbourne'
                            end,
           clocked_out_at = case
                              when cs.clocked_in_at >= (cs.work_date + time '15:06') at time zone 'Australia/Melbourne' then cs.clocked_in_at + interval '1 minute'
                              else (cs.work_date + time '15:06') at time zone 'Australia/Melbourne'
                            end,
           auto_closed    = true
     where cs.clocked_out_at is null
       and cs.work_date < local_now::date
    returning cs.profile_id
  ),
  notif as (
    insert into notifications (profile_id, type, title, body)
    select profile_id, 'auto_clock_out', 'Automatically clocked out',
           'You did not clock out, so your day was recorded as 7:00 am to 3:06 pm. If you worked overtime, ask the office to adjust it.'
      from closed
    returning 1
  )
  select count(*) into n from closed;
  return n;
end $$;

-- A worker's own overtime requests with the approver's name (profiles are not
-- readable across workers, so this goes through a definer function).
create or replace function public.list_my_overtime_requests()
returns table (
  id uuid, status overtime_status, reason text, created_at timestamptz,
  decided_at timestamptz, approver_name text, decider_name text,
  timesheet_id uuid, clock_session_id uuid, work_date date
)
language sql security definer stable set search_path = public as $$
  select o.id, o.status, o.reason, o.created_at, o.decided_at,
         pa.name, pd.name, o.timesheet_id, o.clock_session_id,
         coalesce(t.work_date, s.work_date)
    from public.overtime_requests o
    left join public.profiles pa on pa.id = o.supervisor_id
    left join public.profiles pd on pd.id = o.decided_by
    left join public.timesheets t on t.id = o.timesheet_id
    left join public.clock_sessions s on s.id = o.clock_session_id
   where o.profile_id = auth.uid()
   order by o.created_at desc
   limit 200;
$$;
grant execute on function public.list_my_overtime_requests() to authenticated;
