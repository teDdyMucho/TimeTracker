'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/**
 * Approving/rejecting an attendance record (a clock_sessions row) also updates
 * the matching timesheet (same employee + day + project) so payroll respects the
 * decision: a rejected clock-in voids its hours.
 */
async function setReview(sessionId: string, decision: 'approved' | 'rejected'): Promise<string | null> {
  const admin = createAdminClient()

  // 1. Mark the attendance record itself.
  const { data: session, error } = await admin
    .from('clock_sessions')
    .update({ review_status: decision })
    .eq('id', sessionId)
    .select('profile_id, work_date, project_id, projects(name)')
    .single()
  if (error) return error.message

  if (session) {
    // 2. Mirror onto the timesheet created by this clock session (best-effort link).
    await admin
      .from('timesheets')
      .update({ status: decision })
      .eq('profile_id', session.profile_id)
      .eq('work_date', session.work_date)
      .eq('project_id', session.project_id)

    // 3. Notify the employee (in-app inbox; delivered as push once an EAS build is live).
    const approved = decision === 'approved'
    const project = (session as any).projects?.name as string | undefined
    await admin.from('notifications').insert({
      profile_id: session.profile_id,
      type: approved ? 'attendance_approved' : 'attendance_rejected',
      title: approved ? 'Attendance approved' : 'Attendance rejected',
      body: approved
        ? `Your attendance on ${session.work_date}${project ? ` (${project})` : ''} was approved.`
        : `Your attendance on ${session.work_date}${project ? ` (${project})` : ''} was rejected. Those hours won't be paid — contact your supervisor if this is a mistake.`,
    })
  }

  revalidatePath('/attendance')
  revalidatePath('/') // dashboard counts
  return null
}

export async function approveAttendanceAction(formData: FormData) {
  await setReview(formData.get('id') as string, 'approved')
}

export async function rejectAttendanceAction(formData: FormData) {
  await setReview(formData.get('id') as string, 'rejected')
}
