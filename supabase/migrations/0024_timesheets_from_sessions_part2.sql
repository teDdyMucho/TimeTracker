-- The unique index on clock_session_id is PARTIAL (WHERE clock_session_id IS NOT NULL),
-- so ON CONFLICT must name the same WHERE clause to match it.
CREATE OR REPLACE FUNCTION public.sync_timesheet_from_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  worked numeric;
BEGIN
  IF new.clocked_out_at IS NULL OR new.review_status = 'rejected' THEN
    DELETE FROM timesheets WHERE clock_session_id = new.id;
    RETURN new;
  END IF;

  worked := round(extract(epoch FROM (new.clocked_out_at - new.clocked_in_at)) / 60.0) / 60.0;
  worked := least(greatest(worked, 0.02), 24);

  INSERT INTO timesheets (
    clock_session_id, profile_id, work_date, business_entity_id, project_id,
    work_location, hours, overtime_requested, overtime_reason, overtime_status, status
  ) VALUES (
    new.id, new.profile_id, new.work_date, new.business_entity_id, new.project_id,
    new.work_location, worked, coalesce(new.overtime_requested, false), new.overtime_reason,
    CASE WHEN coalesce(new.overtime_requested, false) THEN 'pending'::overtime_status ELSE 'none'::overtime_status END,
    CASE WHEN new.review_status = 'approved' THEN 'approved'::timesheet_status ELSE 'submitted'::timesheet_status END
  )
  ON CONFLICT (clock_session_id) WHERE clock_session_id IS NOT NULL DO UPDATE SET
    work_date          = excluded.work_date,
    business_entity_id = excluded.business_entity_id,
    project_id         = excluded.project_id,
    work_location      = excluded.work_location,
    hours              = excluded.hours,
    status             = CASE WHEN timesheets.status = 'locked' THEN timesheets.status ELSE excluded.status END,
    updated_at         = now();

  RETURN new;
END;
$func$;
