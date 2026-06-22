export type Role = 'employee' | 'supervisor' | 'admin'
export type WorkLocation = 'site' | 'workshop'
export type OvertimeStatus = 'none' | 'pending' | 'approved' | 'rejected'
export type TimesheetStatus = 'submitted' | 'approved' | 'rejected' | 'locked'
export type PayrollStatus = 'draft' | 'finalised' | 'paid' | 'failed'
export type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'contractor'
export type EntityStatus = 'active' | 'inactive'

export interface WeekdayTier {
  label: string
  fromHour: number
  toHour: number | null
  multiplier: number
}

export interface PayConfig {
  standardDailyHours: number
  weekdayTiers: WeekdayTier[]
  saturdayMultiplier: number
  sundayMultiplier: number
  publicHolidayMultiplier: number
}

export interface BusinessEntity {
  id: string
  name: string
  abn: string | null
  pay_config: PayConfig
  status: EntityStatus
  created_at: string
}

export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  employment_type: EmploymentType
  business_access: string[]
  supervisor_id: string | null
  status: 'active' | 'inactive'
  expo_push_token: string | null
  created_at: string
}

export interface Project {
  id: string
  name: string
  client: string | null
  code: string | null
  business_entity_id: string
  status: 'active' | 'inactive'
  created_at: string
}

export interface Timesheet {
  id: string
  profile_id: string
  work_date: string
  business_entity_id: string
  project_id: string
  work_location: WorkLocation
  hours: number
  overtime_requested: boolean
  overtime_reason: string | null
  overtime_status: OvertimeStatus
  status: TimesheetStatus
  approved_by: string | null
  created_at: string
}

export interface OvertimeRequest {
  id: string
  timesheet_id: string
  profile_id: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

/** Admin-only — never expose to mobile clients */
export interface PayRate {
  id: string
  profile_id: string
  business_entity_id: string
  employment_type: EmploymentType
  hourly_rate: number
  effective_from: string
  effective_to: string | null
}

/** Admin-only */
export interface ProjectFinancials {
  id: string
  project_id: string
  budget_cost: number | null
  actual_cost: number
  updated_at: string
}

/** Admin-only */
export interface PayrollRun {
  id: string
  business_entity_id: string
  period_start: string
  period_end: string
  status: PayrollStatus
  total_gross: number
  total_employees: number
  xero_payrun_id: string | null
  xero_sync_status: 'pending' | 'synced' | 'failed' | 'not_required'
  generated_at: string
}

/** Admin-only */
export interface PayrollEntry {
  id: string
  payroll_run_id: string
  profile_id: string
  period_start: string
  period_end: string
  regular_hours: number
  ot1_hours: number
  ot2_hours: number
  sat_hours: number
  sun_hours: number
  ph_hours: number
  gross_pay: number
  xero_employee_id: string | null
}

export interface PublicHoliday {
  id: string
  date: string
  name: string
  region: string
}
