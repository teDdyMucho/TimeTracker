-- Run AFTER creating admin@buildone.au via Dashboard → Authentication → Add user
-- (with "Auto Confirm User" checked). This links a profile row and sets role=admin.
-- Idempotent: safe to re-run.

insert into public.profiles (id, name, email, role, employment_type, status)
select u.id, 'Admin', u.email, 'admin', 'full_time', 'active'
from auth.users u
where u.email = 'admin@buildone.au'
on conflict (id) do update
  set role  = 'admin',
      email = excluded.email,
      name  = coalesce(public.profiles.name, 'Admin'),
      status = 'active';
