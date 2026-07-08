-- Two-way messaging between admin and each employee (1-on-1 threads).
-- A "thread" is simply all messages for a given employee's profile_id.
-- Admin sends to an employee; employee sends to admin (sender_role tells us which way).

create type message_sender as enum ('admin', 'employee');

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  -- the employee whose thread this message belongs to (the "conversation key")
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- who actually wrote it
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  sender_role message_sender not null,
  body        text not null check (char_length(body) between 1 and 4000),
  read        boolean not null default false,   -- read by the recipient
  created_at  timestamptz not null default now()
);

create index idx_messages_thread on public.messages(profile_id, created_at desc);
create index idx_messages_unread on public.messages(profile_id, read);

alter table public.messages enable row level security;

-- Employee: can read + write messages in their OWN thread only.
create policy msg_own_read on public.messages for select to authenticated
  using (profile_id = auth.uid());
create policy msg_own_insert on public.messages for insert to authenticated
  with check (profile_id = auth.uid() and sender_id = auth.uid() and sender_role = 'employee');
-- Employee may mark admin messages in their thread as read.
create policy msg_own_update on public.messages for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Admin: full access to every thread.
create policy msg_admin_all on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
