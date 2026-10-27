-- 0037 — Per-person exceptions, set on Employees → Edit (Chanelle, 28 Oct 2026: Terry).
--   1. Auto clock-out can now be OFF for a person: auto_clockout_hours = 0 means
--      no job ever closes their session (not the 3:06 pm job, not the N-hour job,
--      not the overnight fallback). null = standard rule, N = N hours after clock-in.
--   2. The automatic unpaid break (30 min on days of 5 h or more) can be switched
--      off for a person: profiles.unpaid_break_exempt = true. The pay engine then
--      deducts nothing for them; everyone else is unchanged.
-- Run in the Supabase SQL Editor. Safe to re-run.

alter table public.profiles drop constraint if exists profiles_auto_clockout_hours_check;
alter table public.profiles add constraint profiles_auto_clockout_hours_check
  check (auto_clockout_hours is null or (auto_clockout_hours >= 0 and auto_clockout_hours <= 24));
comment on column public.profiles.auto_clockout_hours is
  'null = standard rule (still clocked in at 3:06 pm → recorded 7:00–3:06). 0 = never auto clock out. N = closed N hours after the real clock-in.';

alter table public.profiles add column if not exists unpaid_break_exempt boolean not null default false;
comment on column public.profiles.unpaid_break_exempt is
  'true = no automatic 30-minute unpaid break is deducted for this person (set on Employees → Edit).';

-- Admin-only fields.
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
     or new.auto_clockout_hours is distinct from old.auto_clockout_hours
     or new.unpaid_break_exempt is distinct from old.unpaid_break_exempt then
    raise exception 'not authorised to change role/access/pay fields';
  end if;
  return new;
end;
$$;

-- N-hour job: only people with a positive threshold (0 = off).
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
       and p.auto_clockout_hours > 0
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

-- Overnight fallback: people with auto clock-out OFF are left open.
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
       and coalesce(p.auto_clockout_hours, -1) <> 0
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

-- Terry (Build One, 28 Oct 2026): no auto clock-out, no automatic lunch break.
update public.profiles
   set auto_clockout_hours = 0, unpaid_break_exempt = true
 where lower(email) = 'terry@buildonedesignconstruction.com.au';
