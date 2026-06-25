'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { aggregatePayroll, grossPay, type PayConfig } from '@/lib/payroll'

export async function generatePayrollAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const businessEntityId = formData.get('business_entity_id') as string
  const periodStart = formData.get('period_start') as string
  const periodEnd = formData.get('period_end') as string

  if (!businessEntityId || !periodStart || !periodEnd) return 'All fields are required.'
  if (periodStart > periodEnd) return 'Period start must be on or before period end.'

  const admin = createAdminClient()

  // Reject overlapping runs for the same entity
  const { data: existing } = await admin
    .from('payroll_runs')
    .select('id')
    .eq('business_entity_id', businessEntityId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .limit(1)
  if (existing && existing.length > 0) {
    return 'A payroll run already exists for this entity and period.'
  }

  // Entity pay config (OT ladder etc.)
  const { data: entity } = await admin
    .from('business_entities')
    .select('pay_config')
    .eq('id', businessEntityId)
    .maybeSingle()
  if (!entity) return 'Entity not found.'

  // Submitted/approved timesheets in the period
  const { data: tsRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, profiles(name, email)')
    .eq('business_entity_id', businessEntityId)
    .gte('work_date', periodStart)
    .lte('work_date', periodEnd)
    .in('status', ['submitted', 'approved'])

  if (!tsRows || tsRows.length === 0) {
    return 'No submitted or approved timesheets found for this period. Ask employees to submit their hours first.'
  }

  // Public holidays in range → drive day classification
  const { data: holRows } = await admin
    .from('public_holidays')
    .select('date')
    .gte('date', periodStart)
    .lte('date', periodEnd)
  const holidays = new Set((holRows ?? []).map((h: any) => h.date as string))

  const payConfig = entity.pay_config as PayConfig
  const employees = aggregatePayroll(tsRows as any, holidays, payConfig)

  // Current hourly rate per employee (latest effective on/before the period end)
  const profileIds = employees.map((e) => e.profileId)
  const { data: rateRows } = await admin
    .from('pay_rates')
    .select('profile_id, hourly_rate, effective_from')
    .in('profile_id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000'])
    .lte('effective_from', periodEnd)
    .order('effective_from', { ascending: false })
  const rateMap: Record<string, number> = {}
  for (const r of rateRows ?? []) {
    if (!(r.profile_id in rateMap)) rateMap[r.profile_id] = Number(r.hourly_rate)
  }

  // Create the run
  const { data: run, error: runErr } = await admin
    .from('payroll_runs')
    .insert({
      business_entity_id: businessEntityId,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'draft',
      xero_sync_status: 'not_synced',
    })
    .select('id')
    .single()
  if (runErr || !run) return runErr?.message ?? 'Failed to create pay run.'

  // One entry per employee — band hours + computed gross salary (rate × multipliers)
  const entries = employees.map((e) => {
    const rate = rateMap[e.profileId] ?? 0
    const { gross, bandCost } = grossPay(e.bandHours, rate, payConfig)
    return {
      payroll_run_id: run.id,
      profile_id: e.profileId,
      band_hours: e.bandHours,
      band_cost: bandCost,
      gross_pay: gross,
    }
  })
  if (entries.length > 0) {
    const { error: entErr } = await admin.from('payroll_entries').insert(entries)
    if (entErr) {
      await admin.from('payroll_runs').delete().eq('id', run.id) // avoid orphan run
      return entErr.message
    }
  }

  revalidatePath('/payroll')
  return null
}

export async function updatePayrollStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const status = formData.get('status') as string // draft | reviewed | approved | exported
  const admin = createAdminClient()
  await admin.from('payroll_runs').update({ status }).eq('id', id)
  revalidatePath('/payroll')
}

export async function deletePayrollRunAction(formData: FormData) {
  const id = formData.get('id') as string
  const admin = createAdminClient()
  await admin.from('payroll_runs').delete().eq('id', id) // entries cascade
  revalidatePath('/payroll')
}
