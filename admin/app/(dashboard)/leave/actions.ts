'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { sendPushToProfile } from '@/lib/push'

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  personal: 'Personal Leave',
  unpaid: 'Unpaid Leave',
}

async function decideLeave(id: string, decision: 'approved' | 'rejected') {
  const admin = createAdminClient()

  const { data: req, error } = await admin
    .from('leave_requests')
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq('id', id)
    .select('profile_id, leave_type, start_date, end_date')
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (req?.profile_id) {
    const approved = decision === 'approved'
    const label = LEAVE_LABELS[req.leave_type] ?? 'Leave'
    const range = req.start_date === req.end_date ? req.start_date : `${req.start_date} – ${req.end_date}`
    const title = approved ? 'Leave approved' : 'Leave declined'
    const body = `Your ${label} (${range}) was ${approved ? 'approved' : 'declined'}.`
    await admin.from('notifications').insert({
      profile_id: req.profile_id,
      type: approved ? 'leave_approved' : 'leave_rejected',
      title,
      body,
    })
    await sendPushToProfile(admin, req.profile_id, { title, body, data: { type: 'leave' } })
  }

  revalidatePath('/leave')
  revalidatePath('/')
}

export async function approveLeaveAction(formData: FormData) {
  await decideLeave(formData.get('id') as string, 'approved')
}

export async function rejectLeaveAction(formData: FormData) {
  await decideLeave(formData.get('id') as string, 'rejected')
}
