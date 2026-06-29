-- Fix the HTTP 500 on login for the manually-inserted admin user.
-- GoTrue's password-grant crashes when these token columns are NULL instead of ''.
-- This sets them to empty strings and ensures the confirmation timestamps are sane.

update auth.users
set
  confirmation_token       = coalesce(confirmation_token, ''),
  recovery_token           = coalesce(recovery_token, ''),
  email_change             = coalesce(email_change, ''),
  email_change_token_new   = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change             = coalesce(phone_change, ''),
  phone_change_token       = coalesce(phone_change_token, ''),
  reauthentication_token   = coalesce(reauthentication_token, ''),
  email_change_confirm_status = coalesce(email_change_confirm_status, 0),
  updated_at               = now()
where email = 'admin@buildone.au';
-- NOTE: confirmed_at is a GENERATED column in this Supabase version — do not set it.

-- Also normalize the identity row's timestamps if present.
update auth.identities
set last_sign_in_at = coalesce(last_sign_in_at, now()),
    updated_at      = now()
where provider = 'email'
  and identity_data->>'email' = 'admin@buildone.au';
