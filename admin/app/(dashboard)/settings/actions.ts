'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/** Pay cycle (PRD §15 "Fortnightly (configurable)") and labour-cost alerts (PRD §18). */
export async function savePayCycleAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const frequency = formData.get('frequency') as string
  const anchorStart = (formData.get('anchor_start') as string | null)?.trim()

  if (!['weekly', 'fortnightly', 'monthly'].includes(frequency)) return 'Choose a pay frequency.'
  if (!anchorStart || !/^\d{4}-\d{2}-\d{2}$/.test(anchorStart)) return 'Pick the first day of a known pay period.'

  const admin = createAdminClient()
  const { error } = await admin
    .from('settings')
    .upsert({ key: 'pay_cycle', value: { frequency, anchorStart } }, { onConflict: 'key' })
  if (error) return error.message

  revalidatePath('/settings')
  revalidatePath('/payroll')
  revalidatePath('/')
  return null
}

export async function saveLabourAlertAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const enabled = formData.get('enabled') === 'on'
  const pctRaw = (formData.get('threshold_pct') as string | null)?.trim()
  const thresholdPct = Number(pctRaw)
  if (!pctRaw || Number.isNaN(thresholdPct) || thresholdPct <= 0 || thresholdPct > 500) {
    return 'Threshold must be a percentage between 1 and 500.'
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('settings')
    .upsert({ key: 'labour_cost_alert', value: { enabled, thresholdPct } }, { onConflict: 'key' })
  if (error) return error.message

  revalidatePath('/settings')
  return null
}
