-- Add approved_by tracking to timesheets
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
