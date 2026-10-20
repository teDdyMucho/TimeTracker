'use server'
import { REGULAR_HOURS_CAP, OVERTIME_TIER1_HOURS, UNPAID_BREAK_MINUTES, UNPAID_BREAK_MIN_HOURS } from '@/lib/labour-cost'
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
 * Per-entity pay RATES (Entities → Pay settings): the overtime tier
 * multipliers and the Saturday / Sunday / public-holiday multipliers.
 * The ladder boundaries are fixed by the Build One rules — 7.6 h regular a
 * day, the first 2 h over at tier 1, then tier 2 — and the 30 min break on
 * days of 5 h or more is fixed too, so neither is editable here.
 */
export async function updatePayConfigAction(_prevState: string | null, formData: FormData) {
  const id = formData.get('id') as string
  const num = (key: string) => Number((formData.get(key) as string | null)?.trim())

  const t1Mult = num('t1_multiplier')
  const t2Mult = num('t2_multiplier')
  const sat = num('saturday_multiplier')
  const sun = num('sunday_multiplier')
  const ph = num('public_holiday_multiplier')

  const bad = (v: number) => Number.isNaN(v) || v <= 0
  if (bad(t1Mult) || bad(t2Mult) || bad(sat) || bad(sun) || bad(ph)) return 'Multipliers must be positive numbers (e.g. 1.5).'

  const payConfig = {
    standardDailyHours: REGULAR_HOURS_CAP,
    weekdayTiers: [
      { band: 'regular', fromHour: 0, toHour: REGULAR_HOURS_CAP, multiplier: 1 },
      { band: 'overtime_t1', fromHour: REGULAR_HOURS_CAP, toHour: REGULAR_HOURS_CAP + OVERTIME_TIER1_HOURS, multiplier: t1Mult },
      { band: 'overtime_t2', fromHour: REGULAR_HOURS_CAP + OVERTIME_TIER1_HOURS, toHour: null, multiplier: t2Mult },
    ],
    saturdayMultiplier: sat,
    sundayMultiplier: sun,
    publicHolidayMultiplier: ph,
    overtimeRequiresApproval: true,
    unpaidBreak: { enabled: true, minutes: UNPAID_BREAK_MINUTES, afterHours: UNPAID_BREAK_MIN_HOURS },
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
