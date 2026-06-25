// Minimal domain types the mobile client needs. The mobile app deliberately
// never sees money (rates/costs/payroll) — those live in admin-only tables.
// Mirrors packages/shared/src/types.ts (kept local to avoid Metro monorepo config).

export type Role = 'employee' | 'supervisor' | 'admin';
export type WorkLocation = 'site' | 'workshop';
export type OvertimeStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type TimesheetStatus = 'submitted' | 'approved' | 'rejected' | 'locked';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  business_access: string[];
  expo_push_token: string | null;
  avatar_url: string | null;
  notifications_enabled: boolean;
}

export interface BusinessEntity {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  client: string | null;
  business_entity_id: string;
}

export interface Timesheet {
  id: string;
  profile_id: string;
  work_date: string;
  business_entity_id: string;
  project_id: string;
  work_location: WorkLocation;
  hours: number;
  overtime_requested: boolean;
  overtime_reason: string | null;
  overtime_status: OvertimeStatus;
  status: TimesheetStatus;
  created_at: string;
}

/** A single project/location/hours line in the entry form. */
export interface TimesheetLine {
  projectId: string | null;
  projectName: string | null;
  workLocation: WorkLocation;
  hours: number;
}

export interface ClockSession {
  id: string;
  profile_id: string;
  business_entity_id: string;
  project_id: string;
  work_location: WorkLocation;
  work_date: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  selfie_url: string | null;
  overtime_requested: boolean;
  overtime_reason: string | null;
}
