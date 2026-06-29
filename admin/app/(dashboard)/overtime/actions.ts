'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { formatHours } from '@/lib/format'
import { sendPushToProfile } from '@/lib/push'

async function decideOvertime(
  id: string,
  timesheetId: string,
  decision: 'approved' | 'rejected',
) {
  const admin = createAdminClient()

  // Pull details for the employee notification before updating
  const { data: ts } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours')
    .eq('id', timesheetId)
    .maybeSingle()

  const [otRes, tsRes] = await Promise.all([
    admin
      .from('overtime_requests')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', id),
    admin
      .from('timesheets')
      .update({ overtime_status: decision })
      .eq('id', timesheetId),
  ])
  if (otRes.error) throw new Error(otRes.error.message)
  if (tsRes.error) throw new Error(tsRes.error.message)

  // Notify the employee (in-app inbox; also delivered as push once an EAS build is live)
  if (ts?.profile_id) {
    const approved = decision === 'approved'
    const title = approved ? 'Overtime approved' : 'Overtime declined'
    const body = `Your overtime on ${ts.work_date} (${formatHours(Number(ts.hours))}) was ${approved ? 'approved' : 'declined'}.`
    await admin.from('notifications').insert({
      profile_id: ts.profile_id,
      type: approved ? 'overtime_approved' : 'overtime_rejected',
      title,
      body,
    })
    await sendPushToProfile(admin, ts.profile_id, { title, body, data: { type: 'overtime' } })
  }

  revalidatePath('/overtime')
  revalidatePath('/')
}

export async function approveOvertimeAction(formData: FormData) {
  await decideOvertime(formData.get('id') as string, formData.get('timesheet_id') as string, 'approved')
}

export async function rejectOvertimeAction(formData: FormData) {
  await decideOvertime(formData.get('id') as string, formData.get('timesheet_id') as string, 'rejected')
}
