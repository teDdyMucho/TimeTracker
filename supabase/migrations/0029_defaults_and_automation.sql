-- Defaults and automation (17 Oct 2026, revised 19 Oct). Everything here is
-- data, policy or cron; no new tables. Safe to re-run.
--   1. Victorian public holidays from Melbourne Cup 2026 through 2027 (the
--      AFL Grand Final Friday is not seeded until Victoria gazettes it).
--   2. Unpaid-break rule written explicitly into each entity's pay_config
--      (30 min once a day is longer than 5 h) so the default is visible and
--      editable in Entities → Pay settings rather than implied by the code.
--   3. Settings: automatic pay run at period end (on), site URL, cron secret
--      (readable only by the service role; kept out of the audit log).
--   4. pg_cron job that asks the admin site to create the draft pay run the
--      morning after a pay period ends (both DST offsets; the route handles
--      each period once, so the second call is a no-op).

-- ── 1. Public holidays (VIC) ──────────────────────────────────────────────────
insert into public.public_holidays (date, name, region) values
  ('2026-11-03', 'Melbourne Cup Day', 'VIC'),
  ('2026-12-25', 'Christmas Day', 'VIC'),
  ('2026-12-26', 'Boxing Day', 'VIC'),
  ('2026-12-28', 'Boxing Day (in lieu)', 'VIC'),
  ('2027-01-01', 'New Year''s Day', 'VIC'),
  ('2027-01-26', 'Australia Day', 'VIC'),
  ('2027-03-08', 'Labour Day', 'VIC'),
  ('2027-03-26', 'Good Friday', 'VIC'),
  ('2027-03-27', 'Saturday before Easter Sunday', 'VIC'),
  ('2027-03-28', 'Easter Sunday', 'VIC'),
  ('2027-03-29', 'Easter Monday', 'VIC'),
  ('2027-04-25', 'ANZAC Day', 'VIC'),
  ('2027-06-14', 'King''s Birthday', 'VIC'),
  ('2027-11-02', 'Melbourne Cup Day', 'VIC'),
  ('2027-12-25', 'Christmas Day', 'VIC'),
  ('2027-12-26', 'Boxing Day', 'VIC'),
  ('2027-12-27', 'Christmas Day (in lieu)', 'VIC'),
  ('2027-12-28', 'Boxing Day (in lieu)', 'VIC')
on conflict (date, region) do nothing;

-- Every consumer treats a holiday row as applying to all staff (Melbourne
-- workers), so rows for other states must not exist. The dev seed once added
-- QLD-only days; remove any that reached this database.
delete from public.public_holidays where region <> 'VIC';

-- ── 2. Unpaid meal break: make the default explicit per entity ────────────────
update public.business_entities
   set pay_config = coalesce(pay_config, '{}'::jsonb)
                 || jsonb_build_object('unpaidBreak', jsonb_build_object('enabled', true, 'minutes', 30, 'afterHours', 5))
 where pay_config is null or pay_config->'unpaidBreak' is null;

-- ── 3. Settings ───────────────────────────────────────────────────────────────
insert into public.settings (key, value)
values ('auto_pay_run', jsonb_build_object('enabled', true))
on conflict (key) do nothing;

-- Where the admin site lives (the cron job posts to it). Change this row for
-- a staging database instead of editing the function.
insert into public.settings (key, value)
values ('site_url', jsonb_build_object('url', 'https://timevera.netlify.app'))
on conflict (key) do nothing;

-- The cron secret must never be readable by a worker's JWT: the original
-- settings_read policy (0002) let every signed-in user read every row. Narrow
-- it BEFORE the secret row exists. Admin pages read settings with the service
-- role; the middleware reads only the `security` row with the user's JWT.
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated
  using (key <> 'cron_secret');

-- Shared secret the cron job sends to the admin site. The settings audit
-- trigger (0028) would copy the row into audit_logs, which every admin can
-- read, so it is switched off around this write. Rotate the secret the same
-- way: disable the trigger, update the row, re-enable it.
do $$
declare
  has_trigger boolean := exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgname = 'trg_audit_settings' and c.relname = 'settings' and not t.tgisinternal);
begin
  if has_trigger then execute 'alter table public.settings disable trigger trg_audit_settings'; end if;
  insert into public.settings (key, value)
  values ('cron_secret', jsonb_build_object('secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')))
  on conflict (key) do nothing;
  if has_trigger then execute 'alter table public.settings enable trigger trg_audit_settings'; end if;
end $$;

-- ── 4. Automatic pay run at period end ────────────────────────────────────────
-- Calls POST /api/payroll/auto-run on the admin site. The route reads the pay
-- cycle, finds the last completed period, and creates a draft run per entity
-- when none exists yet (then notifies admins "Pay run ready for review").
create or replace function public.request_auto_pay_run()
returns void language plpgsql security definer set search_path = public as $$
declare
  secret text;
  site text;
  enabled boolean;
begin
  select (value->>'enabled')::boolean into enabled from public.settings where key = 'auto_pay_run';
  if enabled is distinct from true then return; end if;
  select value->>'secret' into secret from public.settings where key = 'cron_secret';
  if secret is null then return; end if;
  select value->>'url' into site from public.settings where key = 'site_url';
  if site is null then return; end if;
  perform net.http_post(
    url     := site || '/api/payroll/auto-run',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'request_auto_pay_run failed: %', sqlerrm;
end $$;

revoke all on function public.request_auto_pay_run() from public, anon, authenticated;

-- 00:30 Melbourne is 13:30 UTC in daylight saving and 14:30 UTC otherwise.
select cron.unschedule(jobid) from cron.job where jobname = 'auto-pay-run-period-end';
select cron.schedule(
  'auto-pay-run-period-end',
  '30 13,14 * * *',
  $job$select public.request_auto_pay_run();$job$
);
