-- 0035 — Two corrections. Run in the Supabase SQL Editor after 0033/0034. Safe to re-run.
--
-- 1. Profile guard: let the dashboard save again.
--    0031 rewrote guard_profile_update() and dropped the 0004 line that lets a
--    connection WITHOUT a JWT through (the SQL editor, migrations and, above
--    all, the admin dashboard's service-role client). Since 21 Oct 2026 every
--    dashboard change to role, status (Deactivate / Activate), supervisor,
--    company access, employer, flat rate, employment type or the approver
--    flag has failed with "not authorised to change role/access/pay fields".
--    Workers (JWT, non-admin) are still blocked from touching those fields.
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
     or new.portal_admin       is distinct from old.portal_admin
     or new.xero_payroll       is distinct from old.xero_payroll then
    raise exception 'not authorised to change role/access/pay fields';
  end if;
  return new;
end;
$$;

-- 2. Xero note backfill: use the push that tells the truth.
--    0033 took the LATEST "Xero push failed" notification per run. For ARKO
--    that is the retry ("7 of 7 failed — already exists"), which hides the
--    real state (6 of 7 went through on the first push; only Nic Trainer did
--    not). Prefer, per run, the notification with the FEWEST failures and
--    label such runs "partial".
with best as (
  select distinct on (r.id)
         r.id as run_id,
         n.created_at,
         substr(n.body, length(r.period_start::text || ' – ' || r.period_end::text || ': ') + 1) as reason,
         (regexp_match(n.body, '(\d+) of (\d+) employees failed'))[1]::int as n_failed,
         (regexp_match(n.body, '(\d+) of (\d+) employees failed'))[2]::int as n_total
    from public.payroll_runs r
    join public.business_entities be on be.id = r.business_entity_id
    join public.notifications n
      on n.type = 'xero_sync_failed'
     and n.title like 'Xero push % — ' || be.name
     and n.body like r.period_start::text || ' – ' || r.period_end::text || ':%'
     and n.body ~ '\d+ of \d+ employees failed'
   where r.xero_sync_status in ('failed', 'partial')
   order by r.id, (regexp_match(n.body, '(\d+) of (\d+) employees failed'))[1]::int asc, n.created_at desc
)
update public.payroll_runs r
   set xero_sync_note = best.reason,
       xero_synced_at = best.created_at,
       xero_sync_status = case when best.n_failed < best.n_total then 'partial'::xero_sync_status else r.xero_sync_status end
  from best
 where r.id = best.run_id;
