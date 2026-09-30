'use server'
import { createAdminClient, createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/** Admin sends a message to an employee's thread. */
export async function sendMessageAction(formData: FormData): Promise<void> {
  const profileId = formData.get('profile_id') as string   // the employee (thread owner)
  const body = (formData.get('body') as string)?.trim()
  if (!profileId || !body) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  await admin.from('messages').insert({
    profile_id: profileId,
    sender_id: user.id,
    sender_role: 'admin',
    body,
  })

  // Mark the employee's prior messages as read (admin is viewing the thread).
  await admin.from('messages').update({ read: true })
    .eq('profile_id', profileId).eq('sender_role', 'employee')

  // (A DB trigger on messages notifies the worker and pushes to their phone,
  //  so a reply sent from anywhere — not just here — reaches them.)

  revalidatePath('/messages')
  revalidatePath(`/messages/${profileId}`)
}
