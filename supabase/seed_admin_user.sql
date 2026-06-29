-- ============================================================================
-- Create a new admin user:  admin@buildone.au  /  buildone123
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor (it has the privileges to write auth.users).
-- It is idempotent: re-running updates the password/role instead of erroring.
--
-- NOTE: The cleanest way is Dashboard → Authentication → Add user. This SQL is
-- provided because you asked for it; it mirrors what GoTrue does when it inserts
-- a user (bcrypt-hashed password via pgcrypto's crypt()/gen_salt('bf')).
-- ============================================================================

do $$
declare
  v_user_id uuid;
  v_email   text := 'admin@buildone.au';
  v_pass    text := 'buildone123';
begin
  -- Reuse the user if it already exists, otherwise create it.
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_pass, gen_salt('bf')),       -- bcrypt hash (GoTrue-compatible)
      now(),                                -- mark email confirmed so they can log in
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('name', 'Admin'),
      now(),
      now()
    );

    -- Identity row (required by GoTrue for email/password sign-in).
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      v_email,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );
  else
    -- User exists → just reset the password + confirm email.
    update auth.users
       set encrypted_password = crypt(v_pass, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_user_id;
  end if;

  -- Matching profile row, role = admin (upsert).
  insert into public.profiles (id, name, email, role, employment_type, status)
  values (v_user_id, 'Admin', v_email, 'admin', 'full_time', 'active')
  on conflict (id) do update
    set email = excluded.email,
        role  = 'admin',
        name  = excluded.name;
end $$;
