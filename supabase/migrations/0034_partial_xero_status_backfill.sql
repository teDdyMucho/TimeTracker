-- 0034 — Re-label the existing runs: a push where most people went through
-- is "partial" (Partly sent), not "failed". Run AFTER 0033 (the enum value
-- added there cannot be used in the same script). Safe to re-run.

update public.payroll_runs
   set xero_sync_status = 'partial'
 where xero_sync_status = 'failed'
   and xero_sync_note ~ '^(\d+) of (\d+) employees failed'
   and (regexp_match(xero_sync_note, '^(\d+) of (\d+) employees failed'))[1]::int
     < (regexp_match(xero_sync_note, '^(\d+) of (\d+) employees failed'))[2]::int;
