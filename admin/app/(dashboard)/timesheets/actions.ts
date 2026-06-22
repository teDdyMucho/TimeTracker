'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

export async function approveTimesheetAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const id = formData.get('id') as string
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('timesheets')
    .update({ status: 'approved' })
    .eq('id', id)
  if (error) return error.message
  revalidatePath('/timesheets')
  revalidatePath('/')
  return null
}

export async function rejectTimesheetAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const id = formData.get('id') as string
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('timesheets')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) return error.message
  revalidatePath('/timesheets')
  revalidatePath('/')
  return null
}
