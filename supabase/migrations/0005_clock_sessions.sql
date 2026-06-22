-- Clock In / Clock Out sessions with GPS + selfie
create table public.clock_sessions (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  business_entity_id  uuid not null references public.business_entities(id),
  project_id          uuid not null references public.projects(id),
  work_location       work_location not null default 'site',
  work_date           date not null default current_date,
  clocked_in_at       timestamptz not null default now(),
  clocked_out_at      timestamptz,
  clock_in_lat        double precision,
  clock_in_lng        double precision,
  selfie_url          text,
  overtime_requested  boolean not null default false,
  overtime_reason     text,
  created_at          timestamptz not null default now()
);

create index idx_clock_sessions_profile on public.clock_sessions(profile_id, work_date desc);

alter table public.clock_sessions enable row level security;

create policy cs_own on public.clock_sessions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy cs_supervisor on public.clock_sessions for select to authenticated
  using (public.is_supervisor_of(profile_id));

create policy cs_admin on public.clock_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for selfies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "selfies_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "selfies_own_read" on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "selfies_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and public.is_admin());
