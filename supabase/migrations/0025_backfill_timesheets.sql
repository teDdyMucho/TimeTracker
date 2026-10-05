-- BACKFILL: rebuild every timesheet from its clock session.
-- Safe to run more than once. Locked timesheets (finished pay runs) are untouched.
BEGIN;

-- 1. Remove old unlinked timesheets. They came from the app, the old 16h auto
--    clock-out, and edits that left them stale. Their sessions regenerate them below.
DELETE FROM timesheets
WHERE clock_session_id IS NULL
  AND status <> 'locked';

-- 2. Re-fire the sync trigger for every session. Writing review_status to its own
--    value is enough: the trigger listens on that column.
UPDATE clock_sessions SET review_status = review_status;

COMMIT;

-- 3. Report.
SELECT
  (SELECT count(*) FROM timesheets)                                    AS timesheets_now,
  (SELECT count(*) FROM timesheets WHERE clock_session_id IS NULL)     AS still_unlinked,
  (SELECT count(*) FROM clock_sessions
     WHERE clocked_out_at IS NOT NULL AND review_status <> 'rejected') AS sessions_expecting_one;
