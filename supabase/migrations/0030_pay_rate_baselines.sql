-- Pay rates by worked date (19 Oct 2026, PRD task PAY-04). Safe to re-run.
--
-- Payroll, reports and budget alerts now price each worked day with the rate
-- in force that day (the newest pay_rates row dated on or before the day).
-- Every existing row is dated the day it was typed in, not the day the rate
-- started, so an employee's FIRST row is normalised to a baseline date: it
-- applies to all their earlier work and can never be mistaken for a later
-- change when a rise is back-dated. The app writes new employees' first rate
-- the same way. Exact twin rows (same employee, rate and date — entered
-- twice) are removed first.

-- 1. Remove exact duplicates, keeping the earliest entry.
delete from public.pay_rates p
 using public.pay_rates q
 where q.profile_id = p.profile_id
   and q.hourly_rate = p.hourly_rate
   and q.effective_from = p.effective_from
   and q.created_at < p.created_at;

-- 2. Each employee's earliest rate becomes their baseline.
update public.pay_rates p
   set effective_from = date '2000-01-01'
 where p.effective_from <> date '2000-01-01'
   and p.id = (
     select q.id from public.pay_rates q
      where q.profile_id = p.profile_id
      order by q.effective_from, q.created_at
      limit 1);
