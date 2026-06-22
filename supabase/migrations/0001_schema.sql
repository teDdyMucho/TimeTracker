-- Build One Timesheet Platform — schema (PRD §20)
-- Tables, enums, indexes, and housekeeping triggers. RLS lives in 0002_rls.sql.

create extension if not exists pgcrypto;

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type user_role        as enum ('employee', 'supervisor', 'admin');
create type employment_type  as enum ('full_time', 'part_time', 'casual', 'contractor');
create type work_location    as enum ('site', 'workshop');
create type entity_status    as enum ('active', 'archived');
create type timesheet_status as enum ('submitted', 'approved', 'rejected', 'locked');
create type overtime_status  as enum ('none', 'pending', 'approved', 'rejected');
create type payroll_status   as enum ('draft', 'reviewed', 'approved', 'exported');
create type xero_sync_status as enum ('not_synced', 'pending', 'success', 'failed');
create type pay_band         as enum ('regular','overtime_t1','overtime_t2','saturday','sunday','public_holiday');

-- ─── updated_at helper ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- ─── business_entities ───────────────────────────────────────────────────────
create table public.business_entities (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  status         entity_status not null default 'active',
  xero_tenant_id text,
  -- per-entity pay configuration (overtime ladder, weekend/PH multipliers).
  -- Defaults match PRD §9; fully editable by an admin (rates are contractual).
  pay_config     jsonb not null default jsonb_build_object(
    'standardDailyHours', 8,
    'weekdayTiers', jsonb_build_array(
      jsonb_build_object('band','regular','fromHour',0,'toHour',8,'multiplier',1.0),
      jsonb_build_object('band','overtime_t1','fromHour',8,'toHour',10,'multiplier',1.5),
      jsonb_build_object('band','overtime_t2','fromHour',10,'toHour',null,'multiplier',2.0)
    ),
    'saturdayMultiplier', 1.5,
    'sundayMultiplier', 2.0,
    'publicHolidayMultiplier', 2.5
  ),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_business_entities_updated before update on public.business_entities
  for each row execute function public.set_updated_at();

-- ─── profiles (1:1 with auth.users) ───────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null,
  email           text not null,
  phone           text,
  employment_type employment_type not null default 'full_time',
  role            user_role not null default 'employee',
  supervisor_id   uuid references public.profiles(id) on delete set null,
  business_access uuid[] not null default '{}',
  status          entity_status not null default 'active',
  expo_push_token text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_profiles_supervisor on public.profiles(supervisor_id);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── pay_rates — ADMIN ONLY (PRD §19) ─────────────────────────────────────────
create table public.pay_rates (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  hourly_rate    numeric(10,2) not null check (hourly_rate >= 0),
  cost_rate      numeric(10,2) check (cost_rate >= 0),
  effective_from date not null default current_date,
  created_at     timestamptz not null default now()
);
create index idx_pay_rates_profile on public.pay_rates(profile_id, effective_from desc);

-- ─── projects ─────────────────────────────────────────────────────────────────
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  client           text,
  business_entity_id uuid not null references public.business_entities(id),
  status           entity_status not null default 'active',
  budget_hours     numeric(10,2),
  start_date       date,
  end_date         date,
  actual_hours     numeric(10,2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_projects_entity on public.projects(business_entity_id, status);
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

-- ─── project_financials — ADMIN ONLY ──────────────────────────────────────────
create table public.project_financials (
  project_id         uuid primary key references public.projects(id) on delete cascade,
  budget_labour_cost numeric(12,2),
  actual_labour_cost numeric(12,2) not null default 0,
  updated_at         timestamptz not null default now()
);
create trigger trg_project_financials_updated before update on public.project_financials
  for each row execute function public.set_updated_at();

-- ─── timesheets — HOURS ONLY, no money (PRD §7/§8) ────────────────────────────
create table public.timesheets (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  work_date          date not null,
  business_entity_id uuid not null references public.business_entities(id),
  project_id         uuid not null references public.projects(id),
  work_location      work_location not null,
  hours              numeric(5,2) not null check (hours >= 0.5 and hours <= 24),
  overtime_requested boolean not null default false,
  overtime_reason    text,
  overtime_status    overtime_status not null default 'none',
  status             timesheet_status not null default 'submitted',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_timesheets_profile_date on public.timesheets(profile_id, work_date);
create index idx_timesheets_project      on public.timesheets(project_id);
create index idx_timesheets_entity_date  on public.timesheets(business_entity_id, work_date);
create index idx_timesheets_status       on public.timesheets(status);
create trigger trg_timesheets_updated before update on public.timesheets
  for each row execute function public.set_updated_at();

-- ─── overtime_requests (PRD §10) ──────────────────────────────────────────────
create table public.overtime_requests (
  id            uuid primary key default gen_random_uuid(),
  timesheet_id  uuid not null references public.timesheets(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  supervisor_id uuid references public.profiles(id) on delete set null,
  reason        text not null,
  status        overtime_status not null default 'pending',
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_overtime_supervisor on public.overtime_requests(supervisor_id, status);
create index idx_overtime_profile     on public.overtime_requests(profile_id);

-- ─── payroll_runs / payroll_entries — ADMIN ONLY (PRD §15) ────────────────────
create table public.payroll_runs (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities(id),
  period_start       date not null,
  period_end         date not null,
  status             payroll_status not null default 'draft',
  xero_sync_status   xero_sync_status not null default 'not_synced',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_payroll_runs_entity on public.payroll_runs(business_entity_id, period_start);
create trigger trg_payroll_runs_updated before update on public.payroll_runs
  for each row execute function public.set_updated_at();

create table public.payroll_entries (
  id              uuid primary key default gen_random_uuid(),
  payroll_run_id  uuid not null references public.payroll_runs(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id),
  band_hours      jsonb not null default '{}'::jsonb,
  band_cost       jsonb not null default '{}'::jsonb,
  allowances      numeric(10,2) not null default 0,
  gross_pay       numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (payroll_run_id, profile_id)
);
create index idx_payroll_entries_run on public.payroll_entries(payroll_run_id);

-- ─── public_holidays (PRD §9 — region-aware) ──────────────────────────────────
create table public.public_holidays (
  id     uuid primary key default gen_random_uuid(),
  date   date not null,
  name   text not null,
  region text,
  unique (date, region)
);
create index idx_public_holidays_date on public.public_holidays(date);

-- ─── notifications (PRD §18) ──────────────────────────────────────────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_profile on public.notifications(profile_id, read);

-- ─── audit_logs — ADMIN read; written by service role / triggers ──────────────
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,
  action     text not null,
  table_name text,
  row_id     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ─── settings (global key/value, e.g. pay cycle anchor) ───────────────────────
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();
