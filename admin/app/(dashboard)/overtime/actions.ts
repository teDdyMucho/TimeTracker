'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

export async function approveOvertimeAction(formData: FormData) {
  const id = formData.get('id') as string
  const timesheetId = formData.get('timesheet_id') as string
  const admin = createAdminClient()

  const [otRes, tsRes] = await Promise.all([
    admin
      .from('overtime_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', id),
    admin
      .from('timesheets')
      .update({ overtime_status: 'approved' })
      .eq('id', timesheetId),
  ])

  if (otRes.error) throw new Error(otRes.error.message)
  if (tsRes.error) throw new Error(tsRes.error.message)

  revalidatePath('/overtime')
  revalidatePath('/')
}

export async function rejectOvertimeAction(formData: FormData) {
  const id = formData.get('id') as string
  const timesheetId = formData.get('timesheet_id') as string
  const admin = createAdminClient()

  const [otRes, tsRes] = await Promise.all([
    admin
      .from('overtime_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id),
    admin
      .from('timesheets')
      .update({ overtime_status: 'rejected' })
      .eq('id', timesheetId),
  ])

  if (otRes.error) throw new Error(otRes.error.message)
  if (tsRes.error) throw new Error(tsRes.error.message)

  revalidatePath('/overtime')
  revalidatePath('/')
}
