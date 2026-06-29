import { createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import OvertimeClient from './overtime-client'
import OvertimeFilter from './overtime-filter'

export const dynamic = 'force-dynamic'

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; entity?: string; date?: string; view?: string }>
}) {
  const admin = createAdminClient()
  const params = await searchParams
  const employeeId = params.employee ?? ''
  const entityId = params.entity ?? ''
  const view: 'pending' | 'reviewed' = params.view === 'reviewed' ? 'reviewed' : 'pending'
  // Overtime date filter is based on the linked timesheet's work_date.
  // Default to all days (no param). 'all' is treated the same as empty.
  const today = new Date().toLocaleDateString('en-CA')
  const dateSel = params.date ?? ''
  const date = dateSel === 'all' ? '' : dateSel

  // Dropdown options for the filters.
  const [empRes, entRes] = await Promise.all([
    admin.from('profiles').select('id, name').eq('status', 'active').neq('role', 'admin').order('name'),
    admin.from('business_entities').select('id, name').eq('status', 'active').order('name'),
  ])
  const employees = (empRes.data ?? []) as { id: string; name: string }[]
  const companies = (entRes.data ?? []) as { id: string; name: string }[]

  // Fetch overtime requests with no joins first (avoid FK ambiguity)
  const [pendingRaw, recentRaw] = await Promise.all([
    admin
      .from('overtime_requests')
      .select('id, reason, status, created_at, timesheet_id, profile_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    admin
      .from('overtime_requests')
      .select('id, reason, status, decided_at, timesheet_id, profile_id')
      .in('status', ['approved', 'rejected'])
      .order('decided_at', { ascending: false })
      .limit(20),
  ])

  const allRequests = [...(pendingRaw.data ?? []), ...(recentRaw.data ?? [])]

  // Collect unique IDs to batch-fetch related data
  const timesheetIds = [...new Set(allRequests.map((r) => r.timesheet_id).filter(Boolean))]
  const profileIds = [...new Set(allRequests.map((r) => r.profile_id).filter(Boolean))]

  const [timesheetsRes, profilesRes] = await Promise.all([
    timesheetIds.length > 0
      ? admin
          .from('timesheets')
          .select('id, work_date, hours, work_location, project_id, business_entity_id')
          .in('id', timesheetIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? admin
          .from('profiles')
          .select('id, name, email')
          .in('id', profileIds)
      : Promise.resolve({ data: [] }),
  ])

  const projectIds = [
    ...new Set(
      ((timesheetsRes as any).data ?? []).map((t: any) => t.project_id).filter(Boolean),
    ),
  ]
  const projectsRes =
    projectIds.length > 0
      ? await admin.from('projects').select('id, name').in('id', projectIds)
      : { data: [] }

  // Build lookup maps
  const profileMap = new Map(((profilesRes as any).data ?? []).map((p: any) => [p.id, p]))
  const projectMap = new Map(((projectsRes as any).data ?? []).map((p: any) => [p.id, p]))
  const timesheetMap = new Map(
    ((timesheetsRes as any).data ?? []).map((t: any) => [
      t.id,
      { ...t, projects: projectMap.get(t.project_id) ?? null },
    ]),
  )

  // Merge into enriched records
  function enrich(r: any) {
    return {
      ...r,
      profiles: profileMap.get(r.profile_id) ?? null,
      timesheets: timesheetMap.get(r.timesheet_id) ?? null,
    }
  }

  // Filter by employee + company (the company lives on the linked timesheet).
  function matches(r: any): boolean {
    if (employeeId && r.profile_id !== employeeId) return false
    if (entityId && r.timesheets?.business_entity_id !== entityId) return false
    if (date && r.timesheets?.work_date !== date) return false
    return true
  }

  const pending = (pendingRaw.data ?? []).map(enrich).filter(matches)
  const recent = (recentRaw.data ?? []).map(enrich).filter(matches)

  return (
    <div>
      <PageHeader
        title="Overtime Approvals"
        subtitle={`${pending.length} pending request${pending.length !== 1 ? 's' : ''}`}
      />
      <OvertimeFilter
        employees={employees}
        companies={companies}
        employeeId={employeeId}
        entityId={entityId}
        date={dateSel}
        today={today}
        view={view}
        pendingCount={pending.length}
        reviewedCount={recent.length}
      />
      <OvertimeClient pending={pending} recent={recent} view={view} />
    </div>
  )
}
