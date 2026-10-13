import { createClient, createAdminClient } from '@/lib/server'

export type ViewerRole = 'admin' | 'supervisor'

export interface Viewer {
  id: string
  name: string
  email: string
  role: ViewerRole
  /** Profile ids this viewer may act on. `null` = everyone (admin). */
  teamIds: string[] | null
}

/**
 * Who is using the dashboard. Admins see everything; supervisors (PRD §4) see
 * only the employees whose `supervisor_id` points at them. Pages that scope by
 * team call `scopeIds(viewer)` and actions call `assertCanAct(viewer, profileId)`.
 */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not_authenticated')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  const role: ViewerRole = profile?.role === 'supervisor' ? 'supervisor' : 'admin'
  let teamIds: string[] | null = null
  if (role === 'supervisor') {
    const { data: team } = await admin.from('profiles').select('id').eq('supervisor_id', user.id)
    teamIds = (team ?? []).map((t: any) => t.id as string)
  }

  return {
    id: user.id,
    name: profile?.name ?? user.email ?? 'User',
    email: user.email ?? '',
    role,
    teamIds,
  }
}

/** Supervisor may only act on their own team; admins on anyone. */
export function canAct(viewer: Viewer, profileId: string | null | undefined): boolean {
  if (viewer.role === 'admin') return true
  if (!profileId) return false
  return (viewer.teamIds ?? []).includes(profileId)
}

/** The sentinel used in `.in('profile_id', …)` when a supervisor has no team yet. */
export const NO_ROWS_ID = '00000000-0000-0000-0000-000000000000'

/** Routes a supervisor may open. Everything else redirects to the first one. */
export const SUPERVISOR_PATHS = ['/overtime', '/attendance', '/leave']
