# Build One Workforce Timesheet & Labour Cost Management Platform

## Product Requirements Document (PRD)

**Version 1.0**

---

## 1. Executive Summary

Build One requires a workforce management platform consisting of:

1. A mobile application for field staff and workshop employees to log daily hours quickly and accurately.
2. An admin dashboard for office staff and management to monitor labour allocation, labour costs, project profitability, overtime, and payroll.
3. Automated payroll integration with Xero.

The system will support multiple business entities including **Build One** and **ARKO Joinery** while maintaining a unified employee experience.

The objective is to eliminate manual timesheet collection, improve labour cost visibility, automate payroll processing, and provide accurate labour reporting across projects and business divisions.

---

## 2. Business Objectives

### Primary Objectives

- Reduce payroll administration time by 90%+
- Allow employees to submit timesheets in under 20 seconds
- Track labour costs in real-time
- Allocate labour accurately to projects
- Support multiple business entities
- Automate payroll export to Xero
- Track site labour versus workshop labour
- Improve project profitability reporting

---

## 3. Project Scope

### Included

**Mobile Application**

- Employee login
- Daily timesheet entry
- Multi-project time allocation
- Overtime submission
- Timesheet history
- Push notifications

**Admin Dashboard**

- Employee management
- Project management
- Labour cost tracking
- Payroll processing
- Overtime approvals
- Reporting
- Xero integration

**Integrations**

- Supabase Authentication
- Supabase Postgres Database
- Xero Payroll API
- Expo Push Notifications

### Excluded (Future Phase)

- GPS tracking
- Geofencing
- Leave management
- Safety forms
- Vehicle tracking
- Expense management
- AI forecasting

---

## 4. User Roles

### Employee

| Can | Cannot |
| --- | --- |
| Log hours | View pay rates |
| Select project | View labour costs |
| Select company | View payroll information |
| Select work location | View other employee records |
| Submit overtime | |
| View own timesheets | |

### Supervisor

| Can | Cannot |
| --- | --- |
| Review overtime requests | View payroll rates |
| Approve overtime | View company-wide payroll |
| Reject overtime | |
| View team timesheets | |

### Admin

| Can |
| --- |
| Manage employees |
| Manage projects |
| Configure pay rates |
| Run payroll |
| Generate reports |
| View labour costs |
| Manage public holidays |

---

## 5. Technology Stack

### Mobile App

| Concern | Choice |
| --- | --- |
| Framework | Expo React Native |
| Language | TypeScript |
| State Management | Zustand |
| Forms | React Hook Form |
| UI | NativeWind |
| Notifications | Expo Push Notifications |

### Backend

- Supabase Authentication (GoTrue) — email/password, JWT
- Supabase Postgres Database (with Row Level Security)
- Supabase Edge Functions (Deno) — payroll generation, Xero sync, notification dispatch
- Supabase Storage
- Supabase Realtime — live dashboard updates
- Expo Push Notifications (push tokens stored per user; dispatched from an Edge Function)

### Admin Dashboard

| Concern | Choice |
| --- | --- |
| Framework | Next.js |
| Language | TypeScript |
| Hosting | Vercel |

### Payroll

- Xero Payroll API

---

## 6. Mobile Application Requirements

### Login Screen

- Email login
- Password login
- Forgot password
- Face ID support
- Fingerprint support

### Home Screen

Display:

- Today's Hours
- Weekly Hours
- Pending Overtime
- Recent Timesheets
- Quick Log Button

---

## 7. Timesheet Entry Flow

**Goal:** Submission completed within 20 seconds.

### Step 1 — Select Business

Options:

- Build One
- ARKO Joinery

### Step 2 — Select Project

Searchable Dropdown. Example:

- Brisbane Renovation
- Sunshine Coast Build
- Internal Operations

### Step 3 — Select Work Location

Required. Options:

- On Site
- Factory / Workshop

### Step 4 — Enter Hours Worked

Example: `8.0`

Validation:

- 0.5 minimum
- 24 maximum

### Step 5 — Overtime Required?

Options:

- Yes
- No

### Step 6 — Overtime Reason

Only appears if Overtime = Yes.

### Step 7 — Submit

Confirmation: *"Timesheet Successfully Submitted"*

---

## 8. Multi-Project Allocation

Employees may work on multiple projects in a single day.

Example:

| Project | Hours |
| --- | --- |
| Project A | 4 |
| Project B | 3 |
| Project C | 2 |
| **Total** | **9** |

System must allow multiple entries per day.

---

## 9. Overtime Management

### Overtime Rules

| Band | Hours | Rate | Notes |
| --- | --- | --- | --- |
| Standard Hours | 8 Hours | 1.0x | Configurable |
| Overtime Tier 1 | Hours 9–10 | 1.5x | |
| Overtime Tier 2 | Hours 11+ | 2.0x | |
| Saturday | — | 1.5x | Configurable (default) |
| Sunday | — | 2.0x | Configurable (default) |
| Public Holiday | — | 2.5x | Configurable (default) |

---

## 10. Overtime Approval Workflow

```
Employee Submits Overtime
        ↓
Supervisor Notification
        ↓
Approve or Reject
        ↓
Payroll Updated
        ↓
Employee Notified
```

---

## 11. Labour Cost Engine

**Purpose:** Convert hours worked into actual project labour cost.

### Inputs

- Employee Hourly Rate
- Hours Worked
- Overtime Rules
- Business Entity
- Project
- Work Location
- Public Holidays
- Weekend Rates

### Outputs

- Project Labour Cost
- Business Labour Cost
- Employee Labour Cost
- Payroll Cost
- Site Labour Cost
- Workshop Labour Cost

---

## 12. Employee Management

Admin can:

- Create employees
- Edit employees
- Archive employees
- Assign supervisor
- Assign pay rates

### Employee Record

- Employee ID
- Name
- Email
- Phone
- Hourly Rate *(stored in the admin-only `pay_rates` table — never exposed to employee/supervisor clients, see §19/§20)*
- Employment Type
- Supervisor
- Business Access
- Status

---

## 13. Project Management

Admin can:

- Create projects
- Archive projects
- Manage project budgets

### Project Record

- Project Name
- Client
- Business Entity
- Status
- Budget Hours
- Budget Labour Cost
- Start Date
- End Date
- Actual Labour Cost
- Actual Hours

---

## 14. Admin Dashboard

### Executive Summary

Metrics:

- Total Hours
- Total Labour Cost
- Total Overtime Cost
- Active Employees
- Active Projects
- Payroll Due

### Labour Cost Summary

By:

- Project
- Employee
- Business
- Location Type

---

## 15. Payroll Module

### Payroll Cycle

Fortnightly (Configurable).

### Payroll Calculation

- Regular Hours
- Overtime Hours
- Weekend Hours
- Public Holiday Hours
- Allowances
- Gross Pay

### Payroll Review Screen

- Employee
- Regular Hours
- Overtime
- Gross Pay
- Status

### Payroll Approval

```
Draft → Reviewed → Approved → Exported
```

---

## 16. Xero Integration

**Purpose:** Automate payroll entry.

### Sync Trigger

Admin clicks: **"Export Payroll to Xero"**

### Data Sent

- Employee
- Hours
- Overtime
- Allowances
- Pay Categories
- Business Entity
- Gross Pay

### Sync Status

- Pending
- Success
- Failed

---

## 17. Reporting

### Labour Cost by Project

Filters: Date Range, Project, Business

Displays:

- Hours
- Cost
- Overtime
- Budget Variance

### Labour Cost by Employee

Displays:

- Hours
- Cost
- Overtime
- Projects Worked

### Site vs Factory Analysis

Displays:

- Site Hours
- Workshop Hours
- Site Cost
- Workshop Cost

### Business Entity Report

Displays:

- Build One
- ARKO Joinery
- Future Divisions

### Overtime Report

Displays:

- Employee
- Project
- Hours
- Approval Status
- Cost Impact

---

## 18. Notifications

### Employee

- Timesheet Submitted
- Overtime Approved
- Overtime Rejected
- Missing Timesheet Reminder

### Supervisor

- Overtime Awaiting Approval
- Timesheet Missing

### Admin

- Payroll Ready
- Failed Xero Sync
- Labour Cost Threshold Exceeded

---

## 19. Security

**Authentication:** Supabase Authentication (GoTrue) — email/password, JWT sessions

**Authorization:** Role-Based Access Control enforced by Postgres Row Level Security (RLS)

Roles:

- Employee
- Supervisor
- Admin

Employees Cannot Access:

- Pay Rates
- Payroll Data
- Labour Costs
- Business Reports

---

## 20. Database Tables (Postgres)

| Table | Holds | Readable by |
| --- | --- | --- |
| `profiles` | employee profile, role, business access, push token | self, supervisor (team), admin |
| `pay_rates` | hourly rate + loaded cost rate — **sensitive** | **admin only** |
| `projects` | name, client, business entity, status, dates, hour budgets | any signed-in user |
| `project_financials` | budget/actual labour cost — **sensitive** | **admin only** |
| `timesheets` | hours only (no money), project, location, day | owner, supervisor (team), admin |
| `overtime_requests` | overtime reason, approval state | owner, supervisor, admin |
| `payroll_runs` | fortnightly run header, status — **sensitive** | **admin only** |
| `payroll_entries` | per-employee gross pay + bands — **sensitive** | **admin only** |
| `business_entities` | Build One, ARKO Joinery, future divisions; Xero tenant link | any signed-in user (settings admin-only) |
| `public_holidays` | date, name, region | any signed-in user |
| `notifications` | per-user notifications | recipient, admin |
| `audit_logs` | change history | **admin only** |
| `settings` | overtime config, pay-cycle config | read: signed-in; write: admin |

> **Security split (PRD §19):** Postgres RLS is row-level and cannot hide individual columns,
> so all pay-rate and labour-cost data lives in dedicated **admin-only** tables (`pay_rates`,
> `project_financials`, `payroll_*`). Timesheets store **hours only**; labour cost is computed
> server-side by an Edge Function (using the shared labour-cost engine) and written only to
> admin-only tables. An employee/supervisor JWT can never select rate or cost rows.

---

## 21. Performance Requirements

| Operation | Target |
| --- | --- |
| Timesheet submission | < 3 seconds |
| Dashboard load | < 2 seconds |
| Payroll generation | < 30 seconds |
| Xero sync | < 60 seconds |
| Mobile app startup | < 2 seconds |

---

## 22. Success Metrics

- 95% reduction in manual payroll processing
- 100% project labour allocation
- 100% payroll export accuracy
- 90%+ employee compliance
- 20-second average timesheet submission
- Real-time labour visibility across all projects
- Automated fortnightly payroll generation
- Full Build One and ARKO Joinery labour tracking
- Accurate Site vs Workshop reporting
- Scalable architecture for future business divisions

---

## 23. Future Roadmap (Phase 2)

- GPS Verification
- Geo-fencing
- QR Code Project Check-In
- Leave Management
- Safety Forms
- Vehicle Tracking
- Expense Claims
- Photo Attachments
- AI Labour Forecasting
- Project Profitability Forecasting
- Resource Planning
- Advanced Workforce Analytics
