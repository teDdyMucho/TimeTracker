-- Profile settings: avatar photo + notification preference
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists notifications_enabled boolean not null default true;

-- Public avatars bucket — each user manages their own {uid}/ folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "avatars_own_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');
