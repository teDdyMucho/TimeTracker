-- Attendance review: admin accepts/rejects a clock-in (photo + location proof).
-- pending  = not yet reviewed
-- approved = verified genuine on-site attendance
-- rejected = not genuine; the linked timesheet hours are voided so payroll skips them.

do $$ begin
  create type attendance_review as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

alter table public.clock_sessions
  add column if not exists review_status attendance_review not null default 'pending';

create index if not exists idx_clock_sessions_review
  on public.clock_sessions(review_status, work_date desc);
