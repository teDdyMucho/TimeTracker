import type { SupabaseClient } from '@supabase/supabase-js'
import { grossPay } from '@/lib/payroll'
import { aggregateEmployeeBandsByDay, buildRateHistory, rateOn, normalizePayConfig, labourCost, money, employerMap, UNPAID_BREAK_KEY, PENDING_OVERTIME_KEY, type RateRow } from '@/lib/labour-cost'
import { PAY_BANDS, type PayBand } from '@/lib/payroll'
import { notifyAdmins } from '@/lib/notify-admins'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type ComputedEntry = {
  profile_id: string
  band_hours: Record<string, number>
  band_cost: Record<string, number>
  allowances: number
  gross_pay: number
}

/**
 * Compute one payroll entry per employee for an entity + period from the
 * APPROVED attendance of ACTIVE staff. Shared by "New pay run" (first
 * snapshot), "Recalculate" (refresh an existing run after more attendance
 * was approved) and the automatic period-end run, so all produce identical
 * figures.
 *
 * `existingAllowances` keeps any allowances an admin typed on the run detail
 * page (PRD §15) when a run is recalculated.
 */
export async function computePayrollEntries(
  admin: SupabaseClient,
  businessEntityId: string,
  periodStart: string,
  periodEnd: string,
  existingAllowances: Record<string, number> = {},
): Promise<{ entries: ComputedEntry[] } | { error: string }> {
  // Entity pay config (OT ladder, approval rule, unpaid break …)
  const { data: entity } = await admin
    .from('business_entities')
    .select('pay_config')
    .eq('id', businessEntityId)
    .maybeSingle()
  if (!entity) return { error: 'Entity not found.' }

  // Only APPROVED attendance is paid — pending review is excluded (client rule).
  // Rows from ALL companies are loaded: wages go to the employee's own
  // employer (TV6), whichever company's project they worked on, and the
  // unpaid break is deducted once per day. overtime_status feeds TV3.
  const { data: allRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, overtime_status, business_entity_id, profiles!inner(name, email, flat_rate, status, employer_entity_id, unpaid_break_exempt)')
    .eq('profiles.status', 'active') // deactivated staff are never paid
    .gte('work_date', periodStart)
    .lte('work_date', periodEnd)
    .eq('status', 'approved') // only approved attendance is paid

  const tsRows = (allRows ?? []) as any[]
  const employerOf = employerMap(tsRows)
  const paidHere = (r: any) => (employerOf[r.profile_id] ?? r.business_entity_id) === businessEntityId
  if (!tsRows.some(paidHere)) {
    return { error: 'No approved attendance found for this period for anyone employed by this company. Approve the attendance on the Attendance page first — only approved hours are paid.' }
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
    tsRows.filter((r) => r.profiles?.flat_rate).map((r) => r.profile_id as string),
  )
  // Banded per day so each day can be priced with the rate in force that day
  // (PRD task "Apply pay rates effective on the worked date"): a pay rise
  // part-way through the period applies only from its effective date.
  const employees = aggregateEmployeeBandsByDay(tsRows, holidays, payConfig, flatRateIds, { entityId: businessEntityId, employerOf })

  const profileIds = employees.map((e) => e.profileId)
  const { data: rateRows } = await admin
    .from('pay_rates')
    .select('profile_id, hourly_rate, effective_from, created_at')
    .in('profile_id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000'])
  const rateHistory = buildRateHistory((rateRows ?? []) as RateRow[])

  // One entry per employee — band hours + computed gross (rate × multipliers + allowances)
  const entries = employees.map((e) => {
    const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    const bandCost = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    let gross = 0
    const dates = new Set<string>()
    for (const b of PAY_BANDS) for (const d of Object.keys(e.byBand[b] ?? {})) dates.add(d)
    for (const date of dates) {
      const dayBands = Object.fromEntries(PAY_BANDS.map((b) => [b, e.byBand[b]?.[date] ?? 0])) as Record<PayBand, number>
      const rate = rateOn(rateHistory, e.profileId, date) ?? 0
      const day = grossPay(dayBands, rate, payConfig)
      gross = round2(gross + day.gross)
      for (const b of PAY_BANDS) {
        bandHours[b] = round2(bandHours[b] + dayBands[b])
        bandCost[b] = round2(bandCost[b] + (day.bandCost[b] ?? 0))
      }
    }
    const allowances = round2(existingAllowances[e.profileId] ?? 0)
    return {
      profile_id: e.profileId,
      // The deducted break rides along in band_hours under its own key so the
      // run page / CSV can show it; PAY_BANDS-based totals ignore it.
      // The deducted break and the overtime still awaiting approval (unpaid
      // until approved — TV3) ride along under their own keys.
      band_hours: { ...bandHours, [UNPAID_BREAK_KEY]: e.breakHours, [PENDING_OVERTIME_KEY]: e.pendingOvertimeHours },
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
 * (or the default budget from Settings) and alert admins once per project per
 * threshold crossing (deduped by checking for a recent identical alert).
 */
export async function checkLabourCostThresholds(admin: SupabaseClient, periodEnd: string): Promise<void> {
  try {
    const { data: setting } = await admin.from('settings').select('value').eq('key', 'labour_cost_alert').maybeSingle()
    const cfg = (setting?.value ?? {}) as { enabled?: boolean; thresholdPct?: number; defaultBudget?: number | null }
    if (cfg.enabled === false) return
    const pct = typeof cfg.thresholdPct === 'number' && cfg.thresholdPct > 0 ? cfg.thresholdPct : 100
    const defaultBudget = typeof cfg.defaultBudget === 'number' && cfg.defaultBudget > 0 ? cfg.defaultBudget : null

    const [{ data: fin }, cost] = await Promise.all([
      admin.from('project_financials').select('project_id, budget_labour_cost'),
      labourCost(admin, { from: '2000-01-01', to: periodEnd }),
    ])
    const budgets = new Map<string, number>()
    for (const f of (fin ?? []) as any[]) {
      const b = Number(f.budget_labour_cost)
      if (b > 0) budgets.set(f.project_id as string, b)
    }
    if (budgets.size === 0 && !defaultBudget) return

    const { data: recent } = await admin
      .from('notifications')
      .select('body')
      .eq('type', 'labour_cost_threshold')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    const seen = new Set((recent ?? []).map((n: any) => n.body as string))

    for (const p of cost.byProject) {
      const budget = budgets.get(p.id) ?? defaultBudget
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

/**
 * Create a draft pay run for an entity + period (used by the "New pay run"
 * form and the automatic period-end run). Returns the run id, or an error.
 * Refuses when a run already overlaps the period.
 */
export async function createPayRun(
  admin: SupabaseClient,
  businessEntityId: string,
  periodStart: string,
  periodEnd: string,
  source: 'manual' | 'auto' = 'manual',
  opts: { /** false = the caller runs checkLabourCostThresholds once itself. */ checkThresholds?: boolean } = {},
): Promise<{ id: string; entries: number; gross: number } | { error: string; code?: 'exists' | 'no_attendance' | 'other' }> {
  const { data: existing } = await admin
    .from('payroll_runs')
    .select('id')
    .eq('business_entity_id', businessEntityId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .limit(1)
  if (existing && existing.length > 0) {
    return { error: 'A payroll run already exists for this entity and period. Use “Recalculate” on that run to pick up newly approved hours, or delete it first.', code: 'exists' }
  }

  const computed = await computePayrollEntries(admin, businessEntityId, periodStart, periodEnd)
  if ('error' in computed) return { error: computed.error, code: 'no_attendance' }

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
  if (runErr || !run) return { error: runErr?.message ?? 'Failed to create pay run.', code: 'other' }

  const entries = computed.entries.map((e) => ({ ...e, payroll_run_id: run.id }))
  if (entries.length > 0) {
    const { error: entErr } = await admin.from('payroll_entries').insert(entries)
    if (entErr) {
      await admin.from('payroll_runs').delete().eq('id', run.id) // avoid orphan run
      return { error: entErr.message, code: 'other' }
    }
  }

  // PRD §18 admin notification: "Payroll Ready" + budget threshold check.
  const entityName = (run as any).business_entities?.name ?? 'Entity'
  const totalGross = entries.reduce((s, e) => s + e.gross_pay, 0)
  await notifyAdmins(
    'payroll_ready',
    `Pay run ready for review — ${entityName}`,
    `${periodStart} – ${periodEnd}: ${entries.length} employee${entries.length !== 1 ? 's' : ''}, ${money(totalGross)} gross${source === 'auto' ? ' (created automatically at period end)' : ''}. Review it on the Payroll page.`,
  )
  if (opts.checkThresholds !== false) await checkLabourCostThresholds(admin, periodEnd)

  return { id: run.id, entries: entries.length, gross: round2(totalGross) }
}
