'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { grossPay } from '@/lib/payroll'
import { aggregateEmployeeBands, normalizePayConfig, labourCost, money } from '@/lib/labour-cost'
import { notifyAdmins } from '../inbox-actions'

type Admin = ReturnType<typeof createAdminClient>

type ComputedEntry = {
  profile_id: string
  band_hours: Record<string, number>
  band_cost: Record<string, number>
  allowances: number
  gross_pay: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Compute one payroll entry per employee for an entity + period from the
 * APPROVED attendance of ACTIVE staff. Shared by "New pay run" (first
 * snapshot) and "Recalculate" (refresh an existing run after more attendance
 * was approved), so both always produce identical figures.
 *
 * `existingAllowances` keeps any allowances an admin typed on the run detail
 * page (PRD §15) when a run is recalculated.
 */
async function computePayrollEntries(
  admin: Admin,
  businessEntityId: string,
  periodStart: string,
  periodEnd: string,
  existingAllowances: Record<string, number> = {},
): Promise<{ entries: ComputedEntry[] } | { error: string }> {
  // Entity pay config (OT ladder, approval rule etc.)
  const { data: entity } = await admin
    .from('business_entities')
    .select('pay_config')
    .eq('id', businessEntityId)
    .maybeSingle()
  if (!entity) return { error: 'Entity not found.' }

  // Only APPROVED attendance is paid — pending review is excluded (client rule).
  // overtime_status drives the PRD §10 rule when the entity requires approval.
  const { data: tsRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, overtime_status, profiles!inner(name, email, flat_rate, status)')
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

  const payConfig = normalizePayConfig(entity.pay_config)
  // Flat-rate workers are paid one rate for every hour — no overtime, weekend
  // or public-holiday loading, so all their hours go to the ordinary band.
  const flatRateIds = new Set(
    (tsRows as any[]).filter((r) => r.profiles?.flat_rate).map((r) => r.profile_id as string),
  )
  const employees = aggregateEmployeeBands(tsRows as any, holidays, payConfig, flatRateIds)

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

  // One entry per employee — band hours + computed gross (rate × multipliers + allowances)
  const entries = employees.map((e) => {
    const rate = rateMap[e.profileId] ?? 0
    const { gross, bandCost } = grossPay(e.bandHours, rate, payConfig)
    const allowances = round2(existingAllowances[e.profileId] ?? 0)
    return {
      profile_id: e.profileId,
      band_hours: e.bandHours,
      band_cost: bandCost,
      allowances,
      gross_pay: round2(gross + allowances),
    }
  })
  return { entries }
}

/**
 * PRD §18 "Labour Cost Threshold Exceeded": after a run is created or
 * recalculated, compare each project's labour cost to date against its budget
 * and alert admins once per project per threshold crossing (deduped by
 * checking for a recent identical alert).
 */
async function checkLabourCostThresholds(admin: Admin, periodEnd: string): Promise<void> {
  try {
    const { data: setting } = await admin.from('settings').select('value').eq('key', 'labour_cost_alert').maybeSingle()
    const cfg = (setting?.value ?? {}) as { enabled?: boolean; thresholdPct?: number }
    if (cfg.enabled === false) return
    const pct = typeof cfg.thresholdPct === 'number' && cfg.thresholdPct > 0 ? cfg.thresholdPct : 100

    const [{ data: fin }, cost] = await Promise.all([
      admin.from('project_financials').select('project_id, budget_labour_cost'),
      labourCost(admin, { from: '2000-01-01', to: periodEnd }),
    ])
    const budgets = new Map<string, number>()
    for (const f of (fin ?? []) as any[]) {
      const b = Number(f.budget_labour_cost)
      if (b > 0) budgets.set(f.project_id as string, b)
    }
    if (budgets.size === 0) return

    const { data: recent } = await admin
      .from('notifications')
      .select('body')
      .eq('type', 'labour_cost_threshold')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    const seen = new Set((recent ?? []).map((n: any) => n.body as string))

    for (const p of cost.byProject) {
      const budget = budgets.get(p.id)
      if (!budget) continue
      const used = (p.cost / budget) * 100
      if (used < pct) continue
      const body = `${p.name} has used ${Math.round(used)}% of its labour budget (${money(p.cost)} of ${money(budget)}).`
      if (seen.has(body)) continue
      await notifyAdmins('labour_cost_threshold', 'Labour cost threshold exceeded', body)
    }
  } catch (e) {
    console.error('[checkLabourCostThresholds]', e)
  }
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
    .select('id, business_entities(name)')
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

  // PRD §18 admin notifications: "Payroll Ready" + budget threshold check.
  const entityName = (run as any).business_entities?.name ?? 'Entity'
  const totalGross = entries.reduce((s, e) => s + e.gross_pay, 0)
  await notifyAdmins(
    'payroll_ready',
    `Pay run ready for review — ${entityName}`,
    `${periodStart} – ${periodEnd}: ${entries.length} employee${entries.length !== 1 ? 's' : ''}, ${money(totalGross)} gross. Review it on the Payroll page.`,
  )
  await checkLabourCostThresholds(admin, periodEnd)

  revalidatePath('/payroll')
  revalidatePath('/')
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
  if (run.xero_sync_status === 'success' || run.status === 'exported') {
    return 'This run has already been pushed to Xero. Delete it and create a new pay run instead.'
  }

  // Keep allowances typed on the run detail page.
  const { data: existingEntries } = await admin
    .from('payroll_entries')
    .select('profile_id, allowances')
    .eq('payroll_run_id', run.id)
  const allowances: Record<string, number> = {}
  for (const e of existingEntries ?? []) allowances[e.profile_id] = Number(e.allowances || 0)

  const computed = await computePayrollEntries(admin, run.business_entity_id, run.period_start, run.period_end, allowances)
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

  await checkLabourCostThresholds(admin, run.period_end)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${run.id}`)
  revalidatePath('/')
  return null
}

/**
 * PRD §15 approval flow: Draft → Reviewed → Approved → Exported.
 * "Exported" is set by the Xero push, not by hand.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['reviewed', 'approved'],
  reviewed: ['approved', 'draft'],
  approved: ['reviewed', 'draft'],
  exported: [],
}

export async function updatePayrollStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const status = formData.get('status') as string // draft | reviewed | approved
  const admin = createAdminClient()
  const { data: run } = await admin.from('payroll_runs').select('status').eq('id', id).maybeSingle()
  if (!run) return
  if (!(ALLOWED_TRANSITIONS[run.status] ?? []).includes(status)) return
  await admin.from('payroll_runs').update({ status }).eq('id', id)
  revalidatePath('/payroll')
  revalidatePath(`/payroll/${id}`)
  revalidatePath('/')
}

/** Set a per-employee allowance on a pay run (PRD §15 "Allowances"). */
export async function setAllowanceAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const runId = formData.get('run_id') as string
  const profileId = formData.get('profile_id') as string
  const raw = (formData.get('allowances') as string | null)?.trim() ?? ''
  const amount = raw === '' ? 0 : Number(raw)
  if (!runId || !profileId) return 'Missing entry.'
  if (Number.isNaN(amount) || amount < 0) return 'Allowance must be a positive amount.'

  const admin = createAdminClient()
  const { data: run } = await admin.from('payroll_runs').select('status, xero_sync_status').eq('id', runId).maybeSingle()
  if (!run) return 'Pay run not found.'
  if (run.status === 'exported' || run.xero_sync_status === 'success') return 'This run has been exported to Xero and can no longer be changed.'

  const { data: entry } = await admin
    .from('payroll_entries')
    .select('band_cost')
    .eq('payroll_run_id', runId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!entry) return 'Entry not found.'

  const bandTotal = Object.values((entry.band_cost ?? {}) as Record<string, number>).reduce((s, v) => s + Number(v || 0), 0)
  const { error } = await admin
    .from('payroll_entries')
    .update({ allowances: round2(amount), gross_pay: round2(bandTotal + amount) })
    .eq('payroll_run_id', runId)
    .eq('profile_id', profileId)
  if (error) return error.message

  // Figures changed → back to draft for re-review.
  if (run.status !== 'draft') await admin.from('payroll_runs').update({ status: 'draft' }).eq('id', runId)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${runId}`)
  return null
}

export async function deletePayrollRunAction(formData: FormData) {
  const id = formData.get('id') as string
  const admin = createAdminClient()
  await admin.from('payroll_runs').delete().eq('id', id) // entries cascade
  revalidatePath('/payroll')
  revalidatePath('/')
}
