-- Leave requests: employees submit leave from the mobile app; admins approve or
-- reject from the dashboard (same shape as overtime_requests).

do $$ begin
  create type leave_type as enum ('annual', 'sick', 'personal', 'unpaid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  leave_type  leave_type not null,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  status      leave_status not null default 'pending',
  decided_by  uuid references public.profiles(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_leave_profile on public.leave_requests(profile_id, start_date desc);
create index if not exists idx_leave_status  on public.leave_requests(status, start_date desc);

alter table public.leave_requests enable row level security;

-- Employee: read + create their own requests. Cannot change status.
create policy leave_own_read on public.leave_requests for select to authenticated
  using (profile_id = auth.uid());
create policy leave_own_insert on public.leave_requests for insert to authenticated
  with check (profile_id = auth.uid() and status = 'pending');

-- Admin: full access (view + approve/reject every request).
create policy leave_admin_all on public.leave_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
