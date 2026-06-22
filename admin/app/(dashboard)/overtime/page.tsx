import { createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import OvertimeClient from './overtime-client'

export default async function OvertimePage() {
  const admin = createAdminClient()

  // Fetch overtime requests with no joins first (avoid FK ambiguity)
  const [pendingRaw, recentRaw] = await Promise.all([
    admin
      .from('overtime_requests')
      .select('id, reason, status, created_at, timesheet_id, profile_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    admin
      .from('overtime_requests')
      .select('id, reason, status, reviewed_at, timesheet_id, profile_id')
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false })
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
          .select('id, work_date, hours, work_location, project_id')
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

  const pending = (pendingRaw.data ?? []).map(enrich)
  const recent = (recentRaw.data ?? []).map(enrich)

  return (
    <div>
      <PageHeader
        title="Overtime Approvals"
        subtitle={`${pending.length} pending request${pending.length !== 1 ? 's' : ''}`}
      />
      <OvertimeClient pending={pending} recent={recent} />
    </div>
  )
}
