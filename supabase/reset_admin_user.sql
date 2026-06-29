-- ============================================================================
-- DEFINITIVE FIX for the "Database error querying schema" (HTTP 500) on login.
-- The hand-inserted auth.users/auth.identities rows are subtly malformed.
-- STEP 1: delete them (run this file).
-- STEP 2: recreate the user via Dashboard → Authentication → Add user
--         (admin@buildone.au / buildone123, with "Auto Confirm User" CHECKED).
-- STEP 3: run make_admin_profile.sql to set role = admin.
-- ============================================================================

-- Remove the broken identity + user (profile cascades via FK on delete).
delete from auth.identities
 where identity_data->>'email' = 'admin@buildone.au'
    or user_id in (select id from auth.users where email = 'admin@buildone.au');

delete from public.profiles where email = 'admin@buildone.au';

delete from auth.users where email = 'admin@buildone.au';
