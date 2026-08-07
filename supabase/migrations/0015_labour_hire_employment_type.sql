-- Add "Labour Hire" as an employment type (client request — workers supplied by
-- a labour hire agency, distinct from directly-employed full/part-time/casual).
-- Postgres enums: new values are added with ALTER TYPE ... ADD VALUE.
-- IF NOT EXISTS makes this safe to re-run.

alter type employment_type add value if not exists 'labour_hire';
