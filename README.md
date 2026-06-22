# Build One — Workforce Timesheet & Labour Cost Management Platform

Monorepo for the Build One / ARKO Joinery timesheet, labour-costing and payroll platform.
See [PRD.md](./PRD.md) for the full product requirements.

## Structure

```
TimeTracker/
  PRD.md                    Product Requirements Document
  packages/
    shared/                 Shared TypeScript domain model + labour-cost / overtime engine
  supabase/
    config.toml             Supabase local/CLI config
    migrations/             SQL migrations (schema, RLS policies, seed)
    functions/              Edge Functions (payroll, Xero sync, notifications)  [pending]
  admin/                    Next.js admin dashboard (Vercel)                    ✅
  mobile/                   Expo React Native app                               ✅
```

## Stack

| Layer | Technology |
| --- | --- |
| Mobile | Expo React Native, TypeScript, Zustand, React Hook Form, NativeWind |
| Admin | Next.js (TypeScript), Vercel |
| Backend | **Supabase** — Postgres, Auth (GoTrue), Row Level Security, Storage, Realtime, Edge Functions (Deno) |
| Payroll | Xero Payroll API (one connection per business entity) |
| Push | Expo Push Notifications (dispatched from an Edge Function) |

## Security model (PRD §19)

Pay rates and labour costs are **never** delivered to employee/supervisor clients. Postgres RLS
is row-level and cannot hide individual columns, so sensitive money is isolated in admin-only
tables, enforced by RLS policies:

| Table | Holds | Who can read |
| --- | --- | --- |
| `profiles` | profile, role, business access | self, supervisor (team), admin |
| `pay_rates` | hourly rate, cost rate | **admin only** |
| `projects` | name, client, status, dates, hour budgets | any signed-in user |
| `project_financials` | budget/actual labour cost | **admin only** |
| `timesheets` | hours only (no money) | owner, supervisor, admin |
| `payroll_runs`, `payroll_entries` | gross pay, bands | **admin only** |

Labour cost is computed server-side (Edge Functions) using the shared engine and written only
to admin-only tables.

## Getting started

```bash
# shared domain model + engine (pure TypeScript, no infra needed)
cd packages/shared && npm install && npm test

# local Supabase (Postgres + Auth + Studio) — requires Docker
supabase start
supabase db reset      # applies migrations in supabase/migrations

# admin dashboard (http://localhost:3001)
cd admin && npm install
cp .env.example .env.local   # fill in SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
npm run dev

# mobile app (Expo Go on device)
cd mobile && npm install
cp .env.example .env         # fill in SUPABASE_URL, ANON_KEY
npx expo start
```

## Build order

1. ✅ Shared domain model + labour-cost / overtime engine (+ tests)
2. ✅ Supabase schema + RLS policies (migrations)
3. ✅ Expo mobile app (auth → 20-second timesheet entry → history)
4. ✅ Next.js admin dashboard (employees, projects, costs, approvals, reports, payroll)
5. Edge Functions (fortnightly payroll, notifications)
6. Xero payroll export
