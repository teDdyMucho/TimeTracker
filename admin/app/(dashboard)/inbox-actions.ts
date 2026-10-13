'use server'
import { createClient, createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/** Mark all of the signed-in admin's inbox notifications as read. */
export async function markInboxReadAction(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('notifications').update({ read: true }).eq('profile_id', user.id).eq('read', false)
  revalidatePath('/')
}

/**
 * Admin-facing notifications (PRD §18: payroll ready, failed Xero sync, labour
 * cost threshold exceeded). One inbox row per active admin; the DB trigger
 * pushes it to any admin phone as well.
 */
export async function notifyAdmins(type: string, title: string, body: string): Promise<void> {
  const admin = createAdminClient()
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('status', 'active')
  const rows = (admins ?? []).map((a: any) => ({ profile_id: a.id, type, title, body }))
  if (rows.length === 0) return
  await admin.from('notifications').insert(rows)
}
