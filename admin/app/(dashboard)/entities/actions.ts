'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/server'

export async function createEntityAction(_prevState: string | null, formData: FormData) {
  const name = (formData.get('name') as string).trim()
  if (!name) return 'Entity name is required.'

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('business_entities').insert({ name, status: 'active' })
  if (error) return error.message

  revalidatePath('/entities')
  revalidatePath('/projects')
  return null
}

export async function updateEntityAction(_prevState: string | null, formData: FormData) {
  const id = formData.get('id') as string
  const name = (formData.get('name') as string).trim()
  const xeroTenantId = (formData.get('xero_tenant_id') as string).trim() || null

  if (!name) return 'Entity name is required.'

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('business_entities')
    .update({ name, xero_tenant_id: xeroTenantId })
    .eq('id', id)

  if (error) return error.message

  revalidatePath('/entities')
  revalidatePath('/projects')
  return null
}

/**
 * Per-entity pay settings (PRD §9 "Configurable"): the ordinary-hours cut-off,
 * both overtime tiers, weekend and public-holiday multipliers, and whether
 * overtime must be approved before it is paid at overtime rates (PRD §10).
 * Stored in business_entities.pay_config and read by payroll, project costing
 * and the Xero push.
 */
export async function updatePayConfigAction(_prevState: string | null, formData: FormData) {
  const id = formData.get('id') as string
  const num = (key: string) => Number((formData.get(key) as string | null)?.trim())

  const standard = num('standard_hours')
  const t1To = num('t1_to')
  const t1Mult = num('t1_multiplier')
  const t2Mult = num('t2_multiplier')
  const sat = num('saturday_multiplier')
  const sun = num('sunday_multiplier')
  const ph = num('public_holiday_multiplier')
  const requiresApproval = formData.get('overtime_requires_approval') === 'on'
  // Unpaid meal break (PRD task "Deduct agreed unpaid lunch")
  const breakEnabled = formData.get('break_enabled') === 'on'
  const breakMinutes = num('break_minutes')
  const breakAfter = num('break_after_hours')

  const bad = (v: number) => Number.isNaN(v) || v <= 0
  if (bad(standard) || standard > 24) return 'Ordinary hours per day must be between 0.5 and 24.'
  if (bad(t1To) || t1To <= standard || t1To > 24) return 'Overtime tier 1 must end after the ordinary hours and within 24h.'
  if (bad(t1Mult) || bad(t2Mult) || bad(sat) || bad(sun) || bad(ph)) return 'Multipliers must be positive numbers (e.g. 1.5).'
  if (breakEnabled) {
    if (Number.isNaN(breakMinutes) || breakMinutes < 0 || breakMinutes > 240) return 'Unpaid break must be between 0 and 240 minutes.'
    if (Number.isNaN(breakAfter) || breakAfter < 0 || breakAfter > 24) return 'Unpaid break threshold must be between 0 and 24 hours.'
  }

  const payConfig = {
    standardDailyHours: standard,
    weekdayTiers: [
      { band: 'regular', fromHour: 0, toHour: standard, multiplier: 1 },
      { band: 'overtime_t1', fromHour: standard, toHour: t1To, multiplier: t1Mult },
      { band: 'overtime_t2', fromHour: t1To, toHour: null, multiplier: t2Mult },
    ],
    saturdayMultiplier: sat,
    sundayMultiplier: sun,
    publicHolidayMultiplier: ph,
    overtimeRequiresApproval: requiresApproval,
    unpaidBreak: {
      enabled: breakEnabled,
      minutes: Number.isNaN(breakMinutes) ? 30 : breakMinutes,
      afterHours: Number.isNaN(breakAfter) ? 5 : breakAfter,
    },
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('business_entities')
    .update({ pay_config: payConfig })
    .eq('id', id)
  if (error) return error.message

  revalidatePath('/entities')
  revalidatePath('/payroll')
  revalidatePath('/reports')
  revalidatePath('/')
  return null
}

export async function toggleEntityStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const current = formData.get('current_status') as string
  const next = current === 'active' ? 'archived' : 'active'

  const adminClient = createAdminClient()
  await adminClient.from('business_entities').update({ status: next }).eq('id', id)

  revalidatePath('/entities')
  revalidatePath('/projects')
}
