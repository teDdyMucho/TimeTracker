-- Creates the admin account: admin@buildone.com.au / Admin123
-- Run this in Supabase Dashboard → SQL Editor AFTER running the schema migrations.
-- Change the password after first login.

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN

  -- 1. Auth user (password is bcrypt-hashed by pgcrypto)
  INSERT INTO auth.users (
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
    updated_at,
    is_sso_user,
    is_anonymous
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@buildone.com.au',
    crypt('Admin123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  );

  -- 2. Identity record — required for email/password sign-in to work
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'admin@buildone.com.au'),
    'email',
    'admin@buildone.com.au',
    now(),
    now(),
    now()
  );

  -- 3. Admin profile (access to both Build One and ARKO Joinery)
  INSERT INTO profiles (
    id,
    name,
    email,
    role,
    employment_type,
    business_access,
    status
  ) VALUES (
    new_user_id,
    'Admin',
    'admin@buildone.com.au',
    'admin',
    'full_time',
    ARRAY[
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222'
    ]::uuid[],
    'active'
  );

END $$;
