import { createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import { getViewer, NO_ROWS_ID } from '@/lib/viewer'
import LeaveClient from './leave-client'

export const dynamic = 'force-dynamic'

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const admin = createAdminClient()
  const viewer = await getViewer()
  const teamIds = viewer.teamIds // supervisors (PRD §4) see their team only
  const params = await searchParams
  const view: 'pending' | 'reviewed' = params.view === 'reviewed' ? 'reviewed' : 'pending'

  let pendingQ = admin
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, reason, status, created_at, profile_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  let recentQ = admin
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, reason, status, decided_at, profile_id')
    .in('status', ['approved', 'rejected'])
    .order('decided_at', { ascending: false })
    .limit(30)
  if (teamIds) {
    const ids = teamIds.length ? teamIds : [NO_ROWS_ID]
    pendingQ = pendingQ.in('profile_id', ids)
    recentQ = recentQ.in('profile_id', ids)
  }
  const [pendingRaw, recentRaw] = await Promise.all([pendingQ, recentQ])

  const all = [...(pendingRaw.data ?? []), ...(recentRaw.data ?? [])]
  const profileIds = [...new Set(all.map((r) => r.profile_id).filter(Boolean))]

  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, name, email').in('id', profileIds)
    : { data: [] }
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const enrich = (r: any) => ({ ...r, profile: profileMap.get(r.profile_id) ?? null })
  const pending = (pendingRaw.data ?? []).map(enrich)
  const recent = (recentRaw.data ?? []).map(enrich)

  return (
    <div>
      <PageHeader
        title="Leave Requests"
        subtitle={`${pending.length} pending request${pending.length !== 1 ? 's' : ''}`}
      />
      <LeaveClient pending={pending} recent={recent} view={view} />
    </div>
  )
}
