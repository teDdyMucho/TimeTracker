-- Client: "yung nadeactivate ko po sa timevera dashboard, nakakapag log in pa rin sa app."
-- Deactivating only set profiles.status='archived'. Nothing checked it: the login
-- stayed valid, the app never read status, and RLS let archived users keep
-- clocking in, logging hours and messaging. Five archived people could still work.
--
-- Fix at the database, so it applies to every installed app version at once.

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

-- Clock in / out
drop policy if exists cs_own on public.clock_sessions;
create policy cs_own on public.clock_sessions for all to authenticated
  using (profile_id = auth.uid() and public.is_active_user())
  with check (profile_id = auth.uid() and public.is_active_user());

-- Timesheets
drop policy if exists ts_owner_insert on public.timesheets;
create policy ts_owner_insert on public.timesheets for insert to authenticated
  with check (profile_id = auth.uid() and public.has_entity_access(business_entity_id) and public.is_active_user());

drop policy if exists ts_owner_update on public.timesheets;
create policy ts_owner_update on public.timesheets for update to authenticated
  using (profile_id = auth.uid() and status = 'submitted' and public.is_active_user())
  with check (profile_id = auth.uid() and public.is_active_user());

-- Leave / overtime / messages
drop policy if exists leave_own_insert on public.leave_requests;
create policy leave_own_insert on public.leave_requests for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active_user());

drop policy if exists ot_owner_insert on public.overtime_requests;
create policy ot_owner_insert on public.overtime_requests for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active_user());

drop policy if exists msg_own_insert on public.messages;
create policy msg_own_insert on public.messages for insert to authenticated
  with check (profile_id = auth.uid() and sender_id = auth.uid() and public.is_active_user());

-- Deactivating also revokes the live session, so the phone is signed out on its
-- next token refresh instead of staying logged in indefinitely.
create or replace function public.revoke_sessions_on_archive()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    delete from auth.sessions where user_id = new.id;
    delete from auth.refresh_tokens where user_id = new.id::text;
  end if;
  return new;
exception when others then
  raise warning 'revoke_sessions_on_archive: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_revoke_sessions_on_archive on public.profiles;
create trigger trg_revoke_sessions_on_archive after update of status on public.profiles
  for each row execute function public.revoke_sessions_on_archive();
