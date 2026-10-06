-- The nightly auto clock-out ran at 14:00 UTC = midnight in Brisbane. The sites
-- are in Melbourne, where midnight is 14:00 UTC in winter but 13:00 UTC during
-- daylight saving. pg_cron only speaks UTC, so run at BOTH hours: the function
-- only closes sessions past the limit and never double-logs, so the extra run
-- each night is harmless, and one of the two is always Melbourne midnight.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'auto-clock-out-nightly';

SELECT cron.schedule(
  'auto-clock-out-nightly',
  '0 13,14 * * *',
  $job$select public.auto_clock_out_stale_sessions();$job$
);

SELECT jobname, schedule, active FROM cron.job;
