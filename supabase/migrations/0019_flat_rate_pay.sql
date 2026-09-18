-- Flat-rate workers (client request, 18 Sep 2026): some staff are paid a flat
-- hourly rate regardless of hours worked — no overtime, weekend or public
-- holiday loading. Their hours must all land on the ordinary band.
--
-- Default false: everyone keeps the existing banded treatment until an admin
-- ticks the box on the employee.
alter table public.profiles
  add column if not exists flat_rate boolean not null default false;

comment on column public.profiles.flat_rate is
  'Paid a flat hourly rate: all hours go to the ordinary band, no overtime/weekend/holiday loading.';
