-- Client: "hindi lang sa admin, sa lahat ng account."
-- Audit of what each person actually receives found these gaps:
--   WORKERS got nothing when (a) the office replied to their message — the reply
--   lived only in the in-app thread plus a push from the admin site (so a reply
--   sent by a supervisor, or any future sender, notified nobody), and (b) their
--   own leave or overtime request was submitted (no confirmation it arrived).
--   SUPERVISORS got nothing about their own team at all.
-- Everything below writes an inbox row, which the 0020 trigger pushes to the
-- phone, so it works on every installed app version with no update.

-- ── Any message notifies the OTHER side, whoever sent it ─────────────────────
create or replace function public.on_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; snippet text;
begin
  snippet := left(coalesce(new.body, ''), 140);
  if new.sender_role = 'employee' then
    -- worker → the office (admins + supervisors holding a phone)
    select name into who from profiles where id = new.profile_id;
    perform notify_admins('message',
      format('New message from %s', coalesce(who, 'a worker')), snippet);
  else
    -- office → that worker
    insert into notifications (profile_id, type, title, body)
    values (new.profile_id, 'message', 'New message from the office', snippet);
  end if;
  return new;
exception when others then raise warning 'on_message_sent: %', sqlerrm; return new;
end $$;

drop trigger if exists trg_message_notify_admins on public.messages;
drop trigger if exists trg_message_notify on public.messages;
create trigger trg_message_notify after insert on public.messages
  for each row execute function public.on_message_sent();

-- ── Confirm to the worker that their own request was received ───────────────
create or replace function public.on_leave_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; span text;
begin
  select name into who from profiles where id = new.profile_id;
  span := format('%s leave, %s to %s', initcap(new.leave_type::text), new.start_date, new.end_date);
  perform notify_admins('leave',
    format('Leave request from %s', coalesce(who, 'a worker')), span);
  insert into notifications (profile_id, type, title, body)
  values (new.profile_id, 'leave', 'Leave request submitted',
          format('%s. You''ll be notified once it is reviewed.', span));
  return new;
exception when others then raise warning 'on_leave_request: %', sqlerrm; return new;
end $$;

create or replace function public.on_overtime_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from profiles where id = new.profile_id;
  perform notify_admins('overtime',
    format('Overtime request from %s', coalesce(who, 'a worker')),
    left(coalesce(new.reason, ''), 140));
  insert into notifications (profile_id, type, title, body)
  values (new.profile_id, 'overtime', 'Overtime request submitted',
          'Your overtime request has been sent for approval.');
  return new;
exception when others then raise warning 'on_overtime_request: %', sqlerrm; return new;
end $$;

-- ── Supervisors: tell them when their own team is auto clocked out ──────────
-- notify_admins() already covers admins + supervisors with a phone, so reuse it.
create or replace function public.on_auto_clock_out_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.type <> 'auto_clock_out' then return new; end if;
  select name into who from profiles where id = new.profile_id;
  perform notify_admins('auto_clock_out_team',
    format('%s was automatically clocked out', coalesce(who, 'A worker')),
    'They reached the clock-out limit without clocking out. Check their hours before payroll.');
  return new;
exception when others then raise warning 'on_auto_clock_out_notice: %', sqlerrm; return new;
end $$;

drop trigger if exists trg_auto_clock_out_notify_team on public.notifications;
create trigger trg_auto_clock_out_notify_team after insert on public.notifications
  for each row when (new.type = 'auto_clock_out')
  execute function public.on_auto_clock_out_notice();
