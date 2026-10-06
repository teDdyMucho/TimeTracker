'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { aggregatePayroll, grossPay, type PayConfig } from '@/lib/payroll'

type Admin = ReturnType<typeof createAdminClient>

type ComputedEntry = {
  profile_id: string
  band_hours: Record<string, number>
  band_cost: Record<string, number>
  gross_pay: number
}

/**
 * Compute one payroll entry per employee for an entity + period from the
 * APPROVED attendance of ACTIVE staff. Shared by "New pay run" (first
 * snapshot) and "Recalculate" (refresh an existing run after more attendance
 * was approved), so both always produce identical figures.
 */
async function computePayrollEntries(
  admin: Admin,
  businessEntityId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ entries: ComputedEntry[] } | { error: string }> {
  // Entity pay config (OT ladder etc.)
  const { data: entity } = await admin
    .from('business_entities')
    .select('pay_config')
    .eq('id', businessEntityId)
    .maybeSingle()
  if (!entity) return { error: 'Entity not found.' }

  // Only APPROVED attendance is paid — pending review is excluded (client rule).
  const { data: tsRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, profiles!inner(name, email, flat_rate, status)')
    .eq('profiles.status', 'active') // deactivated staff are never paid
    .eq('business_entity_id', businessEntityId)
    .gte('work_date', periodStart)
    .lte('work_date', periodEnd)
    .eq('status', 'approved') // only approved attendance is paid

  if (!tsRows || tsRows.length === 0) {
    return { error: 'No approved attendance found for this period. Approve the attendance on the Attendance page first — only approved hours are paid.' }
  }

  // Public holidays in range → drive day classification
  const { data: holRows } = await admin
    .from('public_holidays')
    .select('date')
    .gte('date', periodStart)
    .lte('date', periodEnd)
  const holidays = new Set((holRows ?? []).map((h: any) => h.date as string))

  const payConfig = entity.pay_config as PayConfig
  // Flat-rate workers are paid one rate for every hour — no overtime, weekend
  // or public-holiday loading, so all their hours go to the ordinary band.
  const flatRateIds = new Set(
    (tsRows as any[]).filter((r) => r.profiles?.flat_rate).map((r) => r.profile_id as string),
  )
  const employees = aggregatePayroll(tsRows as any, holidays, payConfig, flatRateIds)

  // Current hourly rate per employee — use the latest rate on record.
  // (We don't filter by effective_from <= periodEnd, so a rate set today still
  //  applies to a back-dated run; otherwise gross would silently come out $0.)
  const profileIds = employees.map((e) => e.profileId)
  const { data: rateRows } = await admin
    .from('pay_rates')
    .select('profile_id, hourly_rate, effective_from')
    .in('profile_id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000'])
    .order('effective_from', { ascending: false })
  const rateMap: Record<string, number> = {}
  for (const r of rateRows ?? []) {
    if (!(r.profile_id in rateMap)) rateMap[r.profile_id] = Number(r.hourly_rate)
  }

  // One entry per employee — band hours + computed gross salary (rate × multipliers)
  const entries = employees.map((e) => {
    const rate = rateMap[e.profileId] ?? 0
    const { gross, bandCost } = grossPay(e.bandHours, rate, payConfig)
    return { profile_id: e.profileId, band_hours: e.bandHours, band_cost: bandCost, gross_pay: gross }
  })
  return { entries }
}

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

  // Reject overlapping runs for the same entity — point at Recalculate instead,
  // which refreshes the existing run with any newly approved attendance.
  const { data: existing } = await admin
    .from('payroll_runs')
    .select('id')
    .eq('business_entity_id', businessEntityId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .limit(1)
  if (existing && existing.length > 0) {
    return 'A payroll run already exists for this entity and period. Use “Recalculate” on that run to pick up newly approved hours, or delete it first.'
  }

  const computed = await computePayrollEntries(admin, businessEntityId, periodStart, periodEnd)
  if ('error' in computed) return computed.error

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

  const entries = computed.entries.map((e) => ({ ...e, payroll_run_id: run.id }))
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

/**
 * Recalculate an existing pay run from the current approved attendance. A pay
 * run is a snapshot, so attendance approved AFTER it was generated is not in
 * it until this is run. Keeps the run (same id/links), replaces its entries,
 * and drops the status back to draft because the figures changed.
 * Returns an error message, or null on success.
 */
export async function recalculatePayrollRunAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const id = formData.get('id') as string
  if (!id) return 'Missing pay run.'
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('payroll_runs')
    .select('id, business_entity_id, period_start, period_end, status, xero_sync_status')
    .eq('id', id)
    .maybeSingle()
  if (!run) return 'Pay run not found.'
  if (run.xero_sync_status === 'synced') {
    return 'This run has already been pushed to Xero. Delete it and create a new pay run instead.'
  }

  const computed = await computePayrollEntries(admin, run.business_entity_id, run.period_start, run.period_end)
  if ('error' in computed) return computed.error

  // Replace the snapshot in place: upsert on (run, employee) so existing rows are
  // overwritten rather than deleted first (a failure leaves the old figures,
  // never an empty run), then drop employees who no longer have approved hours.
  const entries = computed.entries.map((e) => ({ ...e, payroll_run_id: run.id }))
  const { error: entErr } = await admin
    .from('payroll_entries')
    .upsert(entries, { onConflict: 'payroll_run_id,profile_id' })
  if (entErr) return entErr.message
  const keep = entries.map((e) => e.profile_id)
  const { error: delErr } = await admin
    .from('payroll_entries')
    .delete()
    .eq('payroll_run_id', run.id)
    .not('profile_id', 'in', `(${keep.join(',')})`)
  if (delErr) return delErr.message
  if (run.status !== 'draft') {
    await admin.from('payroll_runs').update({ status: 'draft' }).eq('id', run.id)
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${run.id}`)
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
