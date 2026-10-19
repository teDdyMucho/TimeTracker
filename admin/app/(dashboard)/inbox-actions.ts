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
