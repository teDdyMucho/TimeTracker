-- Build One Timesheet Platform — seed data (applied by `supabase db reset`).
-- Employees/profiles are provisioned via admin auth flows, so they are NOT seeded
-- here (profiles require matching auth.users rows).

-- ─── Business entities (fixed UUIDs so projects can reference them) ────────────
insert into public.business_entities (id, name, status) values
  ('11111111-1111-1111-1111-111111111111', 'Build One',     'active'),
  ('22222222-2222-2222-2222-222222222222', 'ARKO Joinery',  'active')
on conflict (id) do nothing;

-- ─── Sample projects (PRD §7 examples — Queensland, AU) ───────────────────────
insert into public.projects (id, name, client, business_entity_id, status, budget_hours, start_date) values
  ('33333333-3333-3333-3333-333333333333', 'Brisbane Renovation',   'Private',  '11111111-1111-1111-1111-111111111111', 'active', 600, '2026-05-01'),
  ('44444444-4444-4444-4444-444444444444', 'Sunshine Coast Build',  'Private',  '11111111-1111-1111-1111-111111111111', 'active', 1200, '2026-06-01'),
  ('55555555-5555-5555-5555-555555555555', 'Internal Operations',   null,       '11111111-1111-1111-1111-111111111111', 'active', null, null),
  ('66666666-6666-6666-6666-666666666666', 'Custom Joinery — Showroom', 'Trade', '22222222-2222-2222-2222-222222222222', 'active', 400, '2026-06-08')
on conflict (id) do nothing;

insert into public.project_financials (project_id, budget_labour_cost) values
  ('33333333-3333-3333-3333-333333333333', 36000),
  ('44444444-4444-4444-4444-444444444444', 78000),
  ('66666666-6666-6666-6666-666666666666', 24000)
on conflict (project_id) do nothing;

-- ─── Settings ─────────────────────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('pay_cycle', jsonb_build_object('frequency','fortnightly','anchorStart','2026-06-15')),
  ('company',   jsonb_build_object('country','AU','region','QLD'))
on conflict (key) do nothing;

-- ─── Public holidays — Queensland 2026 (indicative; admin-editable per PRD §4) ─
insert into public.public_holidays (date, name, region) values
  ('2026-01-01', 'New Year''s Day',  'QLD'),
  ('2026-01-26', 'Australia Day',    'QLD'),
  ('2026-04-03', 'Good Friday',      'QLD'),
  ('2026-04-04', 'Easter Saturday',  'QLD'),
  ('2026-04-06', 'Easter Monday',    'QLD'),
  ('2026-04-25', 'Anzac Day',        'QLD'),
  ('2026-05-04', 'Labour Day',       'QLD'),
  ('2026-10-05', 'King''s Birthday', 'QLD'),
  ('2026-12-25', 'Christmas Day',    'QLD'),
  ('2026-12-26', 'Boxing Day',       'QLD'),
  ('2026-12-28', 'Boxing Day (observed)', 'QLD')
on conflict (date, region) do nothing;
