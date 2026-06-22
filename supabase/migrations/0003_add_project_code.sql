-- Add optional reference code to projects (e.g. job number)
alter table public.projects add column if not exists code text;
