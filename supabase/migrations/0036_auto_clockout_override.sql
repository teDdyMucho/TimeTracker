-- 0036 — Automatic clock-out exception (Chanelle, 24 Oct 2026).
-- The 3:06 pm rule (TV9: anyone still clocked in with no overtime request is
-- recorded as 7:00 am – 3:06 pm) stays for everyone, except people with a
-- personal threshold: their session is closed N hours after their real
-- clock-in (robbie@buildone.au and chris@buildone.au: 14 h). Set per person on
-- Employees → Edit → "Auto clock-out after"; blank = the standard rule.
-- Run in the Supabase SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists auto_clockout_hours numeric(4,1)
  check (auto_clockout_hours is null or (auto_clockout_hours >= 1 and auto_clockout_hours <= 24));
comment on column public.profiles.auto_clockout_hours is
  'null = standard rule (still clocked in at 3:06 pm → recorded 7:00–3:06). A number = this person is closed that many hours after their real clock-in instead.';

-- Admin-only field (workers cannot lengthen their own day).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.role                is distinct from old.role
     or new.supervisor_id       is distinct from old.supervisor_id
     or new.business_access     is distinct from old.business_access
     or new.status              is distinct from old.status
     or new.email               is distinct from old.email
     or new.flat_rate           is distinct from old.flat_rate
     or new.employment_type     is distinct from old.employment_type
     or new.employer_entity_id  is distinct from old.employer_entity_id
     or new.overtime_approver   is distinct from old.overtime_approver
     or new.portal_admin        is distinct from old.portal_admin
     or new.xero_payroll        is distinct from old.xero_payroll
     or new.auto_clockout_hours is distinct from old.auto_clockout_hours then
    raise exception 'not authorised to change role/access/pay fields';
  end if;
  return new;
end;
$$;

-- ── 1. 3:06 pm job: skip people with a personal threshold ────────────────────
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
       and not exists (
         select 1 from profiles p
          where p.id = cs.profile_id and p.auto_clockout_hours is not null)
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

-- ── 2. Personal threshold: close N hours after the real clock-in ─────────────
create or replace function public.auto_clock_out_long_sessions()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
begin
  with closed as (
    update clock_sessions cs
       set clocked_out_at = cs.clocked_in_at + make_interval(mins => round(p.auto_clockout_hours * 60)::int),
           auto_closed    = true
      from profiles p
     where p.id = cs.profile_id
       and p.auto_clockout_hours is not null
       and cs.clocked_out_at is null
       and cs.clocked_in_at + make_interval(mins => round(p.auto_clockout_hours * 60)::int) <= now()
    returning cs.profile_id, cs.clocked_out_at, p.auto_clockout_hours
  ),
  notif as (
    insert into notifications (profile_id, type, title, body)
    select profile_id, 'auto_clock_out', 'Automatically clocked out',
           format('You were still clocked in %s hours after clocking in, so your day was closed at %s. Ask the office if that is wrong.',
                  trim(trailing '.0' from auto_clockout_hours::text),
                  to_char(clocked_out_at at time zone 'Australia/Melbourne', 'FMHH12:MI am'))
      from closed
    returning 1
  )
  select count(*) into n from closed;
  return n;
end $$;
revoke all on function public.auto_clock_out_long_sessions() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'auto-clock-out-long-sessions';
select cron.schedule('auto-clock-out-long-sessions', '*/10 * * * *', $job$select public.auto_clock_out_long_sessions();$job$);

-- ── 3. Overnight fallback: honour the personal threshold too ─────────────────
create or replace function public.auto_clock_out_stale_sessions(max_hours numeric default 16)
returns integer language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := (now() at time zone 'Australia/Melbourne');
  n integer := 0;
begin
  with closed as (
    update clock_sessions cs
       set clocked_in_at  = case
                              when p.auto_clockout_hours is not null then cs.clocked_in_at
                              -- clocked in after 3:06 pm (evening work): keep the real start, close a minute later
                              when cs.clocked_in_at >= (cs.work_date + time '15:06') at time zone 'Australia/Melbourne' then cs.clocked_in_at
                              else (cs.work_date + time '07:00') at time zone 'Australia/Melbourne'
                            end,
           clocked_out_at = case
                              when p.auto_clockout_hours is not null then cs.clocked_in_at + make_interval(mins => round(p.auto_clockout_hours * 60)::int)
                              when cs.clocked_in_at >= (cs.work_date + time '15:06') at time zone 'Australia/Melbourne' then cs.clocked_in_at + interval '1 minute'
                              else (cs.work_date + time '15:06') at time zone 'Australia/Melbourne'
                            end,
           auto_closed    = true
      from profiles p
     where p.id = cs.profile_id
       and cs.clocked_out_at is null
       and cs.work_date < local_now::date
    returning cs.profile_id, p.auto_clockout_hours, cs.clocked_out_at
  ),
  notif as (
    insert into notifications (profile_id, type, title, body)
    select profile_id, 'auto_clock_out', 'Automatically clocked out',
           case when auto_clockout_hours is null
                then 'You did not clock out, so your day was recorded as 7:00 am to 3:06 pm. If you worked overtime, ask the office to adjust it.'
                else format('You did not clock out, so your day was closed %s hours after you clocked in (%s). Ask the office if that is wrong.',
                            trim(trailing '.0' from auto_clockout_hours::text),
                            to_char(clocked_out_at at time zone 'Australia/Melbourne', 'FMHH12:MI am'))
           end
      from closed
    returning 1
  )
  select count(*) into n from closed;
  return n;
end $$;

-- ── 4. The two accounts Build One named ──────────────────────────────────────
update public.profiles set auto_clockout_hours = 14
 where lower(email) in ('robbie@buildone.au', 'chris@buildone.au');
