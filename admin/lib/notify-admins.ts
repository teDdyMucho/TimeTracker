import { createAdminClient } from '@/lib/server'

/**
 * Admin-facing notifications (PRD §18: payroll ready, failed Xero sync, labour
 * cost threshold exceeded, pay period ended …). One inbox row per active admin;
 * the DB trigger pushes it to any admin phone as well.
 */
export async function notifyAdmins(type: string, title: string, body: string): Promise<void> {
  const admin = createAdminClient()
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('status', 'active')
  const rows = (admins ?? []).map((a: any) => ({ profile_id: a.id, type, title, body }))
  if (rows.length === 0) return
  await admin.from('notifications').insert(rows)
}
