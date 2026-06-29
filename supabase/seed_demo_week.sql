-- ============================================================================
-- DEMO DATA — one full week of clock-in/out + timesheets + overtime
-- for james, eunice, Joshua. For a video walkthrough.
--
-- Week: Mon 2026-06-22 → Sun 2026-06-28 (matches the dashboard's current week).
-- Each user gets: regular days, a couple of overtime days, a Saturday shift.
-- Clock sessions include GPS + address + review_status='approved'.
-- Timesheets are status='approved' so they flow into payroll.
--
-- Idempotent: re-running wipes this week's rows for these 3 users first.
-- Run in Supabase SQL Editor.
-- ============================================================================

do $$
declare
  v_james   uuid;
  v_eunice  uuid;
  v_joshua  uuid;
  v_entity  uuid;   -- the entity each user has access to
  v_project uuid;   -- a project under that entity
  r record;
  d date;
  v_in  timestamptz;
  v_out timestamptz;
  v_hours numeric(5,2);
  v_ot boolean;
  v_loc work_location;
  v_ts_id uuid;
  -- a tiny transparent png as a stand-in "selfie"
  v_selfie text := 'https://placehold.co/400x400/1C1A16/FFFFFF/png?text=BuildOne';
begin
  select id into v_james  from public.profiles where email = 'james@gmail.com';
  select id into v_eunice from public.profiles where email = 'eunice@gmail.com';
  select id into v_joshua from public.profiles where email = 'joshua@gmail.com';

  -- Clean previous seed for these users in the demo week
  delete from public.overtime_requests
   where profile_id in (v_james, v_eunice, v_joshua)
     and timesheet_id in (select id from public.timesheets where work_date between '2026-06-22' and '2026-06-28');
  delete from public.timesheets
   where profile_id in (v_james, v_eunice, v_joshua)
     and work_date between '2026-06-22' and '2026-06-28';
  delete from public.clock_sessions
   where profile_id in (v_james, v_eunice, v_joshua)
     and work_date between '2026-06-22' and '2026-06-28';

  -- ONE shared entity for all three users so a single pay run shows everyone.
  -- Prefer ARKO Joinery; else the first active entity.
  select id into v_entity from public.business_entities
   where status='active' and name ilike '%ARKO%' limit 1;
  if v_entity is null then
    select id into v_entity from public.business_entities where status='active' order by name limit 1;
  end if;

  -- A project under that entity (else any active project, switching entity to match).
  select id into v_project from public.projects
   where business_entity_id = v_entity and status='active' order by created_at limit 1;
  if v_project is null then
    select id, business_entity_id into v_project, v_entity
      from public.projects where status='active' order by created_at limit 1;
  end if;

  -- Grant all three access to that entity (so it appears as their company) + a pay rate.
  update public.profiles
     set business_access = (select array(select distinct unnest(business_access || array[v_entity])))
   where id in (v_james, v_eunice, v_joshua);

  insert into public.pay_rates (profile_id, hourly_rate)
  select pid, rate from (values
    (v_james, 42.00), (v_eunice, 38.00), (v_joshua, 50.00)
  ) as x(pid, rate)
  where not exists (
    select 1 from public.pay_rates pr where pr.profile_id = x.pid
  );

  -- For each user, log the week under the shared entity/project.
  for r in
    select p.id as pid, p.name as pname
    from public.profiles p
    where p.id in (v_james, v_eunice, v_joshua)
  loop

    -- Walk Mon..Sun
    foreach d in array array[
      date '2026-06-22', date '2026-06-23', date '2026-06-24',
      date '2026-06-25', date '2026-06-26', date '2026-06-27', date '2026-06-28'
    ]
    loop
      -- Sunday off
      if extract(dow from d) = 0 then
        continue;
      end if;

      -- Decide hours / overtime / location for variety per person + day
      v_ot := false;
      v_loc := case when extract(dow from d) in (2,4) then 'workshop' else 'site' end;

      if extract(dow from d) = 6 then
        -- Saturday: short shift, only Joshua works
        if r.pid <> v_joshua then continue; end if;
        v_hours := 5.0;
      elsif r.pid = v_joshua and extract(dow from d) = 3 then
        v_hours := 11.0; v_ot := true;            -- Wed: 11h (OT tier 2)
      elsif r.pid = v_eunice and extract(dow from d) = 4 then
        v_hours := 9.5;  v_ot := true;            -- Thu: 9.5h (OT tier 1)
      elsif r.pid = v_james and extract(dow from d) = 5 then
        v_hours := 10.0; v_ot := true;            -- Fri: 10h (OT tier 1)
      else
        v_hours := 8.0;                            -- normal day
      end if;

      -- Build clock times (start 07:00, end = start + hours)
      v_in  := (d + time '07:00')::timestamptz;
      v_out := v_in + make_interval(mins => (v_hours * 60)::int);

      -- Clock session (with GPS + address + approved review)
      insert into public.clock_sessions
        (profile_id, business_entity_id, project_id, work_location, work_date,
         clocked_in_at, clocked_out_at, clock_in_lat, clock_in_lng, clock_in_address,
         selfie_url, overtime_requested, overtime_reason, review_status)
      values
        (r.pid, v_entity, v_project, v_loc, d,
         v_in, v_out, -27.4698, 153.0251, 'Brisbane City QLD, Australia',
         v_selfie, v_ot, case when v_ot then 'Finishing scheduled works before deadline' else null end,
         'approved'::attendance_review);

      -- Timesheet (approved → flows to payroll)
      insert into public.timesheets
        (profile_id, work_date, business_entity_id, project_id, work_location, hours,
         overtime_requested, overtime_reason, overtime_status, status)
      values
        (r.pid, d, v_entity, v_project, v_loc, v_hours,
         v_ot, case when v_ot then 'Finishing scheduled works before deadline' else null end,
         (case when v_ot then 'approved' else 'none' end)::overtime_status,
         'approved'::timesheet_status)
      returning id into v_ts_id;

      -- Overtime request row for the OT days (one left pending for the demo)
      if v_ot then
        insert into public.overtime_requests (timesheet_id, profile_id, reason, status, decided_at)
        values (
          v_ts_id, r.pid, 'Finishing scheduled works before deadline',
          (case when r.pid = v_james then 'pending' else 'approved' end)::overtime_status,   -- james' OT left pending to demo approve/reject
          case when r.pid = v_james then null else now() end
        );
      end if;
    end loop;
  end loop;
end $$;
