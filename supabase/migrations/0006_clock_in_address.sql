-- Add reverse-geocoded address column to clock_sessions
ALTER TABLE public.clock_sessions
  ADD COLUMN IF NOT EXISTS clock_in_address text;
