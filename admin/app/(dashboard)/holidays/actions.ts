'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/**
 * Public holidays (PRD §4 "Manage public holidays"). Payroll reads this table to
 * band a day's hours at the public-holiday rate, so every date listed here
 * applies to all entities.
 */
export async function addHolidayAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const date = (formData.get('date') as string | null)?.trim()
  const name = (formData.get('name') as string | null)?.trim()
  const region = (formData.get('region') as string | null)?.trim() || null

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Please pick a date.'
  if (!name) return 'Please enter the holiday name.'

  const admin = createAdminClient()
  const { error } = await admin.from('public_holidays').insert({ date, name, region })
  if (error) {
    if (error.code === '23505') return 'That date is already listed for this region.'
    return error.message
  }

  revalidatePath('/holidays')
  revalidatePath('/payroll')
  return null
}

export async function deleteHolidayAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  if (!id) return
  const admin = createAdminClient()
  await admin.from('public_holidays').delete().eq('id', id)
  revalidatePath('/holidays')
  revalidatePath('/payroll')
}
