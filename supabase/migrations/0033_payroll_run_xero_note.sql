-- 0033 — Pay run list: say WHY a Xero push failed (and what a successful push did).
-- Until now the Xero column only showed "Failed"; the reason went to the admin
-- bell. The push now records a short note on the run itself.
-- Run in the Supabase SQL Editor. Safe to re-run.

-- A push where most people went through and one or two did not is no longer
-- "failed": it is "partial" (shown as "Partly sent"), with the reasons in the
-- note. "failed" now means nothing was sent. (0034 re-labels the existing runs;
-- a new enum value cannot be used in the same script that adds it.)
alter type xero_sync_status add value if not exists 'partial';

alter table public.payroll_runs add column if not exists xero_sync_note text;
alter table public.payroll_runs add column if not exists xero_synced_at timestamptz;
comment on column public.payroll_runs.xero_sync_note is
  'Outcome of the last Xero push: the per-employee reasons when it failed, a summary (created / updated / already approved / skipped) when it succeeded.';

-- Backfill the runs that already show "Failed": take the reason from the
-- latest "Xero push failed" admin notification for that company and period.
update public.payroll_runs r
   set xero_sync_note = n.reason,
       xero_synced_at = n.created_at
  from (
    select distinct on (be.id, r2.period_start, r2.period_end)
           r2.id as run_id,
           n.created_at,
           substr(n.body, length(r2.period_start::text || ' – ' || r2.period_end::text || ': ') + 1) as reason
      from public.payroll_runs r2
      join public.business_entities be on be.id = r2.business_entity_id
      join public.notifications n
        on n.type = 'xero_sync_failed'
       and n.title = 'Xero push failed — ' || be.name
       and n.body like r2.period_start::text || ' – ' || r2.period_end::text || ':%'
     where r2.xero_sync_status = 'failed'
     order by be.id, r2.period_start, r2.period_end, n.created_at desc
  ) n
 where r.id = n.run_id
   and r.xero_sync_note is null;
