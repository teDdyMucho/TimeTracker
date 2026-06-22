/**
 * Build One Timesheet Platform — shared domain model.
 *
 * These types are the single source of truth shared by the mobile app, the
 * admin dashboard, and the Supabase Edge Functions. Money fields (pay rates,
 * labour costs, payroll) are deliberately separated from the records that
 * employee/supervisor clients can read — see PRD §19/§20.
 */

// ─── Enums ───────────────────────────────────────────────────────────────

export type Role = 'employee' | 'supervisor' | 'admin';

export type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'contractor';

/** Where the hours were worked — drives site-vs-workshop labour reporting (PRD §7 step 3, §17). */
export type WorkLocation = 'site' | 'workshop';

export type EntityStatus = 'active' | 'archived';

export type TimesheetStatus = 'submitted' | 'approved' | 'rejected' | 'locked';

export type OvertimeStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type PayrollRunStatus = 'draft' | 'reviewed' | 'approved' | 'exported';

export type XeroSyncStatus = 'not_synced' | 'pending' | 'success' | 'failed';

/**
 * Pay band a chunk of hours falls into. Maps 1:1 to a Xero earnings rate
 * (PRD §15/§16). `regular`/`overtime_t1`/`overtime_t2` come from the weekday
 * tier ladder; `saturday`/`sunday`/`public_holiday` are whole-day rates.
 */
export type PayBand =
  | 'regular'
  | 'overtime_t1'
  | 'overtime_t2'
  | 'saturday'
  | 'sunday'
  | 'public_holiday';

export type DayType = 'weekday' | 'saturday' | 'sunday' | 'public_holiday';

// ─── Pay configuration (PRD §9) ──────────────────────────────────────────

export interface WeekdayTier {
  band: 'regular' | 'overtime_t1' | 'overtime_t2';
  /** Inclusive lower bound of cumulative daily hours this tier starts at. */
  fromHour: number;
  /** Exclusive upper bound; `null` means open-ended (all remaining hours). */
  toHour: number | null;
  multiplier: number;
}

/**
 * Fully configurable per business entity. NOTHING here is hard-coded to law —
 * overtime/weekend rates are a matter of the employment agreement, so they live
 * in `settings` / `business_entities` and are editable by an admin (PRD §9, §12).
 */
export interface PayConfig {
  /** Standard ordinary hours per day before overtime begins. */
  standardDailyHours: number;
  /** Weekday overtime ladder, ordered from lowest band up. */
  weekdayTiers: WeekdayTier[];
  saturdayMultiplier: number;
  sundayMultiplier: number;
  publicHolidayMultiplier: number;
}

// ─── Records (mirror the Postgres tables in PRD §20) ───────────────────────

/** `business_entities` — Build One, ARKO Joinery, future divisions. */
export interface BusinessEntity {
  id: string;
  name: string;
  status: EntityStatus;
  /** Xero organisation/tenant this entity's pay run pushes into (one per entity). */
  xeroTenantId: string | null;
}

/** `profiles` — non-sensitive employee record (readable by self/supervisor/admin). */
export interface Profile {
  id: string; // == auth.users.id
  name: string;
  email: string;
  phone: string | null;
  employmentType: EmploymentType;
  role: Role;
  supervisorId: string | null;
  /** Business entities this employee may log time against. */
  businessAccess: string[];
  status: EntityStatus;
  expoPushToken: string | null;
}

/** `pay_rates` — ADMIN ONLY. Never delivered to employee/supervisor clients. */
export interface PayRate {
  profileId: string;
  /** Base hourly pay rate ($/hr). */
  hourlyRate: number;
  /**
   * Loaded cost rate ($/hr) including on-costs (super/leave/levies). Used for
   * project labour costing; falls back to `hourlyRate` when not set.
   */
  costRate: number | null;
  effectiveFrom: string; // ISO date
}

/** `projects` — non-sensitive (readable by any signed-in user). */
export interface Project {
  id: string;
  name: string;
  client: string | null;
  businessEntityId: string;
  status: EntityStatus;
  budgetHours: number | null;
  startDate: string | null;
  endDate: string | null;
  actualHours: number;
}

/** `project_financials` — ADMIN ONLY. */
export interface ProjectFinancials {
  projectId: string;
  budgetLabourCost: number | null;
  actualLabourCost: number;
}

/**
 * `timesheets` — HOURS ONLY, no money. One row per (employee, day, project),
 * so a day can span multiple projects/entities/locations (PRD §8).
 */
export interface Timesheet {
  id: string;
  profileId: string;
  workDate: string; // ISO date (YYYY-MM-DD)
  businessEntityId: string;
  projectId: string;
  workLocation: WorkLocation;
  hours: number;
  overtimeRequested: boolean;
  overtimeReason: string | null;
  overtimeStatus: OvertimeStatus;
  status: TimesheetStatus;
  createdAt: string;
}

/** `overtime_requests` — approval workflow (PRD §10). */
export interface OvertimeRequest {
  id: string;
  timesheetId: string;
  profileId: string;
  supervisorId: string | null;
  reason: string;
  status: Exclude<OvertimeStatus, 'none'>;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** `payroll_runs` — ADMIN ONLY (PRD §15). */
export interface PayrollRun {
  id: string;
  businessEntityId: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  xeroSyncStatus: XeroSyncStatus;
  createdAt: string;
}

/** `payroll_entries` — ADMIN ONLY. One per employee per run. */
export interface PayrollEntry {
  id: string;
  payrollRunId: string;
  profileId: string;
  bandHours: Record<PayBand, number>;
  bandCost: Record<PayBand, number>;
  allowances: number;
  grossPay: number;
}

export interface PublicHoliday {
  id: string;
  date: string; // ISO date
  name: string;
  region: string | null;
}
