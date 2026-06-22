-- Seeds the two business entities: Build One and ARKO Joinery
-- Run this in Supabase Dashboard → SQL Editor
-- Uses fixed UUIDs so they match the admin profile's business_access array in seed_admin.sql

INSERT INTO public.business_entities (id, name, status, pay_config)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Build One',
    'active',
    '{
      "overtimeDailyThreshold": 8,
      "overtime1Rate": 1.5,
      "overtime1Hours": 2,
      "overtime2Rate": 2.0,
      "saturdayRate": 1.5,
      "sundayRate": 2.0,
      "publicHolidayMultiplier": 2.5
    }'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'ARKO Joinery',
    'active',
    '{
      "overtimeDailyThreshold": 8,
      "overtime1Rate": 1.5,
      "overtime1Hours": 2,
      "overtime2Rate": 2.0,
      "saturdayRate": 1.5,
      "sundayRate": 2.0,
      "publicHolidayMultiplier": 2.5
    }'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
