-- Diagnose the admin login. Run in Supabase SQL Editor and read the output.
select
  u.id,
  u.email,
  u.email_confirmed_at,                       -- must NOT be null
  (u.encrypted_password is not null)  as has_password,
  u.encrypted_password = crypt('buildone123', u.encrypted_password) as password_matches,  -- must be true
  u.aud,
  u.role            as auth_role,             -- should be 'authenticated'
  (select count(*) from auth.identities i where i.user_id = u.id) as identity_count,       -- should be >= 1
  p.role            as profile_role           -- should be 'admin'
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'admin@buildone.au';
