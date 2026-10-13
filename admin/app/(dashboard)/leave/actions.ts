'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { getViewer, canAct } from '@/lib/viewer'

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  personal: 'Personal Leave',
  unpaid: 'Unpaid Leave',
}

async function decideLeave(id: string, decision: 'approved' | 'rejected') {
  const admin = createAdminClient()
  const viewer = await getViewer()

  // Supervisors (PRD §4) may only decide leave for their own team.
  if (viewer.role === 'supervisor') {
    const { data: target } = await admin.from('leave_requests').select('profile_id').eq('id', id).maybeSingle()
    if (!canAct(viewer, target?.profile_id)) throw new Error('You can only review leave for your own team.')
  }

  const { data: req, error } = await admin
    .from('leave_requests')
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: viewer.id })
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
