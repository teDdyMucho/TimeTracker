-- Build One Timesheet Platform — Row Level Security (PRD §19)
--
-- Core guarantee: an employee or supervisor JWT can NEVER read pay rates,
-- labour costs, or payroll. Those tables get NO non-admin SELECT policy, so
-- (with RLS forced) the rows are simply invisible. Edge Functions use the
-- service_role key, which bypasses RLS, to compute and write that data.

-- ─── Helper functions (SECURITY DEFINER → bypass RLS internally, no recursion) ─
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_supervisor_of(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = target and supervisor_id = auth.uid());
$$;

create or replace function public.has_entity_access(eid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or eid = any(business_access))
  );
$$;

-- ─── Prevent privilege escalation on self-update of profiles ──────────────────
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new; -- admins may change anything
  end if;
  -- non-admins may only touch their own contact info / push token
  if new.role            is distinct from old.role
     or new.supervisor_id   is distinct from old.supervisor_id
     or new.business_access is distinct from old.business_access
     or new.status          is distinct from old.status
     or new.email           is distinct from old.email then
    raise exception 'not authorised to change role/access fields';
  end if;
  return new;
end;
$$;
create trigger trg_guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ─── Enable RLS on every table (API roles are not the table owner) ────────────
alter table public.business_entities  enable row level security;
alter table public.profiles            enable row level security;
alter table public.pay_rates           enable row level security;
alter table public.projects            enable row level security;
alter table public.project_financials  enable row level security;
alter table public.timesheets          enable row level security;
alter table public.overtime_requests   enable row level security;
alter table public.payroll_runs        enable row level security;
alter table public.payroll_entries     enable row level security;
alter table public.public_holidays     enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.settings            enable row level security;

-- ═══ business_entities — readable by any signed-in user, writable by admin ════
create policy be_select on public.business_entities for select to authenticated using (true);
create policy be_admin  on public.business_entities for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ profiles ═════════════════════════════════════════════════════════════════
create policy profiles_self_read    on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_team_read    on public.profiles for select to authenticated using (supervisor_id = auth.uid());
create policy profiles_admin_read   on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_self_update  on public.profiles for update to authenticated using (id = auth.uid());          -- guarded by trigger
create policy profiles_admin_write  on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ pay_rates — ADMIN ONLY (no other policy exists) ══════════════════════════
create policy pay_rates_admin on public.pay_rates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ projects — read for all signed-in, write admin ═══════════════════════════
create policy projects_read  on public.projects for select to authenticated using (true);
create policy projects_admin on public.projects for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ project_financials — ADMIN ONLY ══════════════════════════════════════════
create policy project_financials_admin on public.project_financials for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ timesheets ═══════════════════════════════════════════════════════════════
create policy ts_owner_read  on public.timesheets for select to authenticated using (profile_id = auth.uid());
create policy ts_team_read   on public.timesheets for select to authenticated using (public.is_supervisor_of(profile_id));
create policy ts_admin_read  on public.timesheets for select to authenticated using (public.is_admin());
create policy ts_owner_insert on public.timesheets for insert to authenticated
  with check (profile_id = auth.uid() and public.has_entity_access(business_entity_id));
create policy ts_owner_update on public.timesheets for update to authenticated
  using (profile_id = auth.uid() and status = 'submitted')
  with check (profile_id = auth.uid());
create policy ts_owner_delete on public.timesheets for delete to authenticated
  using (profile_id = auth.uid() and status = 'submitted');
create policy ts_supervisor_update on public.timesheets for update to authenticated
  using (public.is_supervisor_of(profile_id));
create policy ts_admin_write on public.timesheets for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ overtime_requests ════════════════════════════════════════════════════════
create policy ot_owner_read   on public.overtime_requests for select to authenticated using (profile_id = auth.uid());
create policy ot_super_read   on public.overtime_requests for select to authenticated using (supervisor_id = auth.uid() or public.is_supervisor_of(profile_id));
create policy ot_admin_read   on public.overtime_requests for select to authenticated using (public.is_admin());
create policy ot_owner_insert on public.overtime_requests for insert to authenticated with check (profile_id = auth.uid());
create policy ot_super_update on public.overtime_requests for update to authenticated
  using (supervisor_id = auth.uid() or public.is_supervisor_of(profile_id) or public.is_admin());

-- ═══ payroll_runs / payroll_entries — ADMIN ONLY ══════════════════════════════
create policy payroll_runs_admin    on public.payroll_runs    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payroll_entries_admin on public.payroll_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ public_holidays — read all, write admin ═════════════════════════════════
create policy ph_read  on public.public_holidays for select to authenticated using (true);
create policy ph_admin on public.public_holidays for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ notifications — recipient reads/updates own; admin all ═══════════════════
create policy notif_own_read   on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy notif_own_update on public.notifications for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notif_admin      on public.notifications for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ audit_logs — admin read only (writes via service role) ═══════════════════
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- ═══ settings — read all signed-in, write admin ══════════════════════════════
create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());
