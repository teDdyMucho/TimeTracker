-- 0032 — Xero push: people who are not on any Xero payroll.
-- The 22 Oct 2026 push failed for Build One and ARKO Joinery because two
-- people with approved hours (a director, and a worker not yet set up in
-- Xero) are on neither company's Xero payroll, and one failed employee marks
-- the whole run as failed. `xero_payroll = false` marks a person as "not paid
-- through Xero": the push lists them as skipped instead of failing the run.
-- Set per person on Employees → Edit → "Paid through Xero payroll".
-- Run in the Supabase SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists xero_payroll boolean not null default true;
comment on column public.profiles.xero_payroll is
  'false = not on any Xero payroll (e.g. a director): the Xero push skips this person instead of failing.';

-- Admin-only field: a worker cannot take themselves off (or put themselves on) the Xero push.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Direct DB / service role (the admin dashboard's server actions) / migrations: no JWT.
  if auth.uid() is null then
    return new;
  end if;
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
     or new.overtime_approver  is distinct from old.overtime_approver
     or new.xero_payroll       is distinct from old.xero_payroll then
    raise exception 'not authorised to change role/access/pay fields';
  end if;
  return new;
end;
$$;
