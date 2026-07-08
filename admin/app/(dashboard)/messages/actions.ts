'use server'
import { createAdminClient, createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { sendPushToProfile } from '@/lib/push'

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

  // Push to the employee's phone + it lands in their in-app messages.
  await sendPushToProfile(admin, profileId, {
    title: 'New message from Admin',
    body: body.length > 120 ? body.slice(0, 117) + '…' : body,
    data: { type: 'message' },
  })

  revalidatePath('/messages')
  revalidatePath(`/messages/${profileId}`)
}
