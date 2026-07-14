'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { sendPushToProfile } from '@/lib/push'

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
    const title = approved ? 'Attendance approved' : 'Attendance rejected'
    const body = approved
      ? `Your attendance on ${session.work_date}${project ? ` (${project})` : ''} was approved.`
      : `Your attendance on ${session.work_date}${project ? ` (${project})` : ''} was rejected. Those hours won't be paid — contact your supervisor if this is a mistake.`

    await admin.from('notifications').insert({
      profile_id: session.profile_id,
      type: approved ? 'attendance_approved' : 'attendance_rejected',
      title,
      body,
    })
    // Push to the phone (works on an EAS build; no-op without a token).
    await sendPushToProfile(admin, session.profile_id, { title, body, data: { type: 'attendance' } })
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

/**
 * Manually add an attendance record. The admin picks the employee, project and
 * clock-in/out times. The company (business_entity_id) is derived from the
 * chosen project so it always stays consistent.
 *
 * `clocked_in_at` / `clocked_out_at` arrive as ISO strings already converted to
 * UTC in the browser (the <input type="datetime-local"> local value is turned
 * into an ISO string client-side), so we store them as-is. `work_date` is the
 * calendar day of the clock-in, in the admin's local timezone (passed as
 * `work_date`), matching how the mobile app records it.
 */
export async function addAttendanceAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const admin = createAdminClient()

  const profileId = formData.get('profile_id') as string
  const projectId = formData.get('project_id') as string
  const clockedInAt = formData.get('clocked_in_at') as string
  const clockedOutAt = (formData.get('clocked_out_at') as string) || null
  const workDate = formData.get('work_date') as string
  const workLocation = (formData.get('work_location') as string) || 'site'
  const review = (formData.get('review_status') as string) || 'approved'

  if (!profileId) return 'Please choose an employee.'
  if (!projectId) return 'Please choose a project.'
  if (!clockedInAt) return 'Please set the clock-in time.'
  if (!workDate) return 'Missing work date.'
  if (clockedOutAt && new Date(clockedOutAt) <= new Date(clockedInAt)) {
    return 'Clock-out must be after clock-in.'
  }

  // Derive the company from the project (they are always linked).
  const { data: project } = await admin
    .from('projects')
    .select('business_entity_id')
    .eq('id', projectId)
    .single()
  if (!project) return 'That project no longer exists.'

  const { error } = await admin.from('clock_sessions').insert({
    profile_id: profileId,
    business_entity_id: project.business_entity_id,
    project_id: projectId,
    work_location: workLocation,
    work_date: workDate,
    clocked_in_at: clockedInAt,
    clocked_out_at: clockedOutAt,
    review_status: review,
  })
  if (error) return error.message

  revalidatePath('/attendance')
  revalidatePath('/') // dashboard counts
  return null
}

/**
 * Edit an existing attendance record's clock-in / clock-out times (and optional
 * project / work type / review). Same time-handling as the add action: the
 * ISO strings are already UTC. `work_date` is recomputed from the new clock-in.
 */
export async function editAttendanceAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const admin = createAdminClient()

  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const clockedInAt = formData.get('clocked_in_at') as string
  const clockedOutAt = (formData.get('clocked_out_at') as string) || null
  const workDate = formData.get('work_date') as string
  const workLocation = (formData.get('work_location') as string) || 'site'
  const review = (formData.get('review_status') as string) || 'pending'

  if (!id) return 'Missing record id.'
  if (!projectId) return 'Please choose a project.'
  if (!clockedInAt) return 'Please set the clock-in time.'
  if (!workDate) return 'Missing work date.'
  if (clockedOutAt && new Date(clockedOutAt) <= new Date(clockedInAt)) {
    return 'Clock-out must be after clock-in.'
  }

  const { data: project } = await admin
    .from('projects')
    .select('business_entity_id')
    .eq('id', projectId)
    .single()
  if (!project) return 'That project no longer exists.'

  const { error } = await admin
    .from('clock_sessions')
    .update({
      business_entity_id: project.business_entity_id,
      project_id: projectId,
      work_location: workLocation,
      work_date: workDate,
      clocked_in_at: clockedInAt,
      clocked_out_at: clockedOutAt,
      review_status: review,
    })
    .eq('id', id)
  if (error) return error.message

  revalidatePath('/attendance')
  revalidatePath('/')
  return null
}

/** Permanently delete an attendance record (e.g. a mistaken manual entry). */
export async function deleteAttendanceAction(formData: FormData) {
  const admin = createAdminClient()
  const id = formData.get('id') as string
  if (!id) return
  await admin.from('clock_sessions').delete().eq('id', id)
  revalidatePath('/attendance')
  revalidatePath('/')
}
