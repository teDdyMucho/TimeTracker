// Minimal domain types the mobile client needs. The mobile app deliberately
// never sees money (rates/costs/payroll) — those live in admin-only tables.
// Mirrors packages/shared/src/types.ts (kept local to avoid Metro monorepo config).

export type Role = 'employee' | 'supervisor' | 'admin';
export type WorkLocation = 'site' | 'workshop';
export type OvertimeStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type TimesheetStatus = 'submitted' | 'approved' | 'rejected' | 'locked';

export interface Profile {
  /** 'active' | 'archived' — an archived worker is signed out on sight. */
  status?: string;
  id: string;
  name: string;
  email: string;
  role: Role;
  business_access: string[];
  expo_push_token: string | null;
  avatar_url: string | null;
  notifications_enabled: boolean;
  /** TV3: may approve / reject overtime requests (Robbie, Mitch, Chris, Terry). */
  overtime_approver?: boolean;
  /** null = standard 3:06 pm auto clock-out; a number = closed that many hours after clock-in (0036). */
  auto_clockout_hours?: number | null;
  /** TV6: the company whose payroll pays this person. */
  employer_entity_id?: string | null;
}

/** Someone a worker can send an overtime request to. */
export interface OvertimeApprover { id: string; name: string }

/** A pending request addressed to the signed-in approver (list_my_overtime_approvals). */
export interface OvertimeApproval {
  id: string;
  profile_id: string;
  worker_name: string;
  work_date: string | null;
  hours: number | null;
  project_name: string | null;
  reason: string;
  status: OvertimeStatus;
  created_at: string;
  still_on_clock: boolean;
}

/** One of the signed-in worker's own requests (list_my_overtime_requests). */
export interface MyOvertimeRequest {
  id: string;
  status: OvertimeStatus;
  reason: string;
  created_at: string;
  decided_at: string | null;
  approver_name: string | null;
  decider_name: string | null;
  timesheet_id: string | null;
  clock_session_id: string | null;
  work_date: string | null;
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
  /** Joined from the projects table (fetchRecentTimesheets) for display. */
  projects?: { name: string | null } | null;
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
