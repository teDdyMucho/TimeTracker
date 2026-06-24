-- ─── Xero OAuth connections — stores tokens per connected Xero org (tenant) ───
-- Sensitive: tokens grant payroll access. Service-role only (no RLS policies).

create table public.xero_connections (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null unique,
  tenant_name   text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  connected_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Lock it down: only the server (service-role key) may read/write tokens.
alter table public.xero_connections enable row level security;

create trigger trg_xero_connections_updated before update on public.xero_connections
  for each row execute function public.set_updated_at();
