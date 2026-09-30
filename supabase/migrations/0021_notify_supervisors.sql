-- Worker events were fanned out to role='admin' only. In this org the people who
-- actually run the business are SUPERVISORS (Robbie, Chris) and they are the ones
-- carrying phones; the two admin "Robbie Wynne" accounts have no device at all.
-- So the inbox rows were created but reached nobody. Notify anyone who can act on
-- the request — admin OR supervisor — and only those with a phone registered.
create or replace function public.notify_admins(n_type text, n_title text, n_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, type, title, body)
  select id, n_type, n_title, n_body
    from public.profiles
   where status = 'active'
     and role in ('admin', 'supervisor')
     and expo_push_token is not null
     and notifications_enabled is not false;
$$;
