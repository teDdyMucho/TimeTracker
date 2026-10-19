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
  // Default labour budget for projects that have none of their own (blank = off).
  const budgetRaw = (formData.get('default_budget') as string | null)?.trim() ?? ''
  const defaultBudget = budgetRaw === '' ? null : Number(budgetRaw)
  if (defaultBudget != null && (Number.isNaN(defaultBudget) || defaultBudget < 0)) return 'Default budget must be a positive amount or blank.'

  const admin = createAdminClient()
  const { error } = await admin
    .from('settings')
    .upsert({ key: 'labour_cost_alert', value: { enabled, thresholdPct, defaultBudget } }, { onConflict: 'key' })
  if (error) return error.message

  revalidatePath('/settings')
  revalidatePath('/projects')
  revalidatePath('/reports')
  return null
}

/** Automatic draft pay run the morning after each pay period ends (default on). */
export async function saveAutoPayRunAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const enabled = formData.get('enabled') === 'on'
  const admin = createAdminClient()
  // Merge: the row also remembers the last period the automatic run handled.
  const { data: cur } = await admin.from('settings').select('value').eq('key', 'auto_pay_run').maybeSingle()
  const value = { ...((cur?.value as Record<string, unknown> | null) ?? {}), enabled }
  const { error } = await admin
    .from('settings')
    .upsert({ key: 'auto_pay_run', value }, { onConflict: 'key' })
  if (error) return error.message
  revalidatePath('/settings')
  return null
}

/** Security: require every admin to set up an authenticator app (PRD task "Verify admin 2FA"). */
export async function saveSecurityAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const requireAdmin2fa = formData.get('require_admin_2fa') === 'on'
  const admin = createAdminClient()
  const { error } = await admin
    .from('settings')
    .upsert({ key: 'security', value: { requireAdmin2fa } }, { onConflict: 'key' })
  if (error) return error.message
  revalidatePath('/settings')
  return null
}
