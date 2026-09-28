-- Notification overhaul (client report 29 Sep 2026: "no notifications arrive").
-- Audit findings this fixes, all server-side so every existing phone benefits:
--   1. notifications had no INSERT policy → the app's own inserts (e.g. its
--      auto clock-out notice) were silently rejected.
--   2. Nothing pushed to the PHONE except four admin actions; the nightly auto
--      clock-out only wrote an inbox row nobody saw.
--   3. Worker → admin events (new message, overtime request, leave request)
--      notified nobody at all.
-- Design: an inbox row in `notifications` IS the notification; an AFTER INSERT
-- trigger delivers it to the phone via Expo push (pg_net, async, best-effort).
-- Worker events insert inbox rows for each active admin, which then auto-push.

create extension if not exists pg_net;

-- The app may write its own notifications (admin/service role already could).
create policy notif_own_insert on public.notifications
  for insert to authenticated with check (profile_id = auth.uid());

-- ── Push an inbox row to its owner's phone ────────────────────────────────────
create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tok text; enabled boolean;
begin
  select expo_push_token, notifications_enabled into tok, enabled
    from profiles where id = new.profile_id;
  if tok is null or enabled = false
     or (tok not like 'ExponentPushToken%' and tok not like 'ExpoPushToken%') then
    return new;
  end if;
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := jsonb_build_object(
      'to', tok, 'title', new.title, 'body', coalesce(new.body, ''),
      'sound', 'default', 'priority', 'high', 'channelId', 'default',
      'data', jsonb_build_object('type', new.type)
    ),
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb
  );
  return new;
exception when others then
  -- A push failure must never block the insert itself.
  raise warning 'notify_push failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notifications_push on public.notifications;
create trigger trg_notifications_push after insert on public.notifications
  for each row execute function public.notify_push();

-- ── Worker → admin fan-out: one inbox row per active admin ───────────────────
create or replace function public.notify_admins(n_type text, n_title text, n_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, type, title, body)
  select id, n_type, n_title, n_body
    from public.profiles where role = 'admin' and status = 'active';
$$;

create or replace function public.on_employee_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from profiles where id = new.profile_id;
  perform notify_admins('message',
    format('New message from %s', coalesce(who, 'a worker')),
    left(new.body, 140));
  return new;
exception when others then raise warning 'on_employee_message: %', sqlerrm; return new;
end $$;

drop trigger if exists trg_message_notify_admins on public.messages;
create trigger trg_message_notify_admins after insert on public.messages
  for each row when (new.sender_role = 'employee')
  execute function public.on_employee_message();

create or replace function public.on_overtime_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from profiles where id = new.profile_id;
  perform notify_admins('overtime',
    format('Overtime request from %s', coalesce(who, 'a worker')),
    left(coalesce(new.reason, ''), 140));
  return new;
exception when others then raise warning 'on_overtime_request: %', sqlerrm; return new;
end $$;

drop trigger if exists trg_overtime_notify_admins on public.overtime_requests;
create trigger trg_overtime_notify_admins after insert on public.overtime_requests
  for each row execute function public.on_overtime_request();

create or replace function public.on_leave_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from profiles where id = new.profile_id;
  perform notify_admins('leave',
    format('Leave request from %s', coalesce(who, 'a worker')),
    format('%s leave, %s to %s', initcap(new.leave_type::text), new.start_date, new.end_date));
  return new;
exception when others then raise warning 'on_leave_request: %', sqlerrm; return new;
end $$;

drop trigger if exists trg_leave_notify_admins on public.leave_requests;
create trigger trg_leave_notify_admins after insert on public.leave_requests
  for each row execute function public.on_leave_request();
