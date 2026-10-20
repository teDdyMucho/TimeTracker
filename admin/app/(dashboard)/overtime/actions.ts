'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { formatHours } from '@/lib/format'
import { getViewer, canAct } from '@/lib/viewer'

async function decideOvertime(
  id: string,
  timesheetId: string,
  decision: 'approved' | 'rejected',
) {
  const admin = createAdminClient()
  const viewer = await getViewer()
  // TV3: only a named approver decides; everyone else (e.g. Chanelle) can view.
  if (!viewer.overtimeApprover) throw new Error('Only an overtime approver can approve or reject overtime. You can view requests but not decide them.')

  // Pull details for the employee notification before updating
  const { data: ts } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours')
    .eq('id', timesheetId)
    .maybeSingle()

  // Supervisors (PRD §4) may only decide requests from their own team.
  if (!canAct(viewer, ts?.profile_id)) throw new Error('You can only review overtime for your own team.')

  const [otRes, tsRes] = await Promise.all([
    admin
      .from('overtime_requests')
      .update({ status: decision, decided_at: new Date().toISOString(), decided_by: viewer.id })
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
    const body = `${viewer.name} ${approved ? 'approved' : 'declined'} your overtime on ${ts.work_date} (${formatHours(Number(ts.hours))}).`
    await admin.from('notifications').insert({
      profile_id: ts.profile_id,
      type: approved ? 'overtime_approved' : 'overtime_rejected',
      title,
      body,
    })
  }

  revalidatePath('/overtime')
  revalidatePath('/payroll') // approval can change overtime pay (PRD §10)
  revalidatePath('/')
}

export async function approveOvertimeAction(formData: FormData) {
  await decideOvertime(formData.get('id') as string, formData.get('timesheet_id') as string, 'approved')
}

export async function rejectOvertimeAction(formData: FormData) {
  await decideOvertime(formData.get('id') as string, formData.get('timesheet_id') as string, 'rejected')
}
