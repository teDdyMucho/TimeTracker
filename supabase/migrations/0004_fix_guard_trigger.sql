-- Allow direct DB connections (SQL editor, migrations, service_role) to bypass
-- the profile update guard. auth.uid() is null in those contexts.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- direct DB / service_role / migration: no JWT, allow through
  if auth.uid() is null then
    return new;
  end if;
  -- authenticated admin: allow anything
  if public.is_admin() then
    return new;
  end if;
  -- non-admin: block changes to privileged fields
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
