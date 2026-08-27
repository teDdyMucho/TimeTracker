import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { aggregatePayroll, PAY_BANDS, type PayConfig } from '@/lib/payroll'
import {
  getValidXeroToken,
  fetchXeroEmployees,
  fetchXeroEarningsRates,
  fetchXeroLeaveTypes,
  fetchTimesheetTracking,
  matchEarningsRateId,
  matchLeaveTypeId,
  postXeroTimesheet,
  postXeroLeave,
} from '@/lib/xero'

const LEAVE_TITLES: Record<string, string> = {
  annual: 'Annual Leave', sick: 'Sick / Personal Leave', personal: 'Personal Leave', unpaid: 'Unpaid Leave',
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Number of days (inclusive) between two ISO dates. */
function daysInPeriod(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime()
  const b = new Date(to + 'T00:00:00').getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

/**
 * Push approved worked hours to Xero as APPROVED timesheets.
 *   POST /api/xero/push-timesheet?run=<payrollRunId>
 *   POST /api/xero/push-timesheet?entity=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * One timesheet per employee, one line per pay band mapped to a Xero earnings
 * rate. Once approved, Xero pulls the hours into the matching draft pay run.
 * Requires the payroll.timesheets scope.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const runId = sp.get('run')
  let entityId = sp.get('entity') ?? ''
  let from = sp.get('from') ?? ''
  let to = sp.get('to') ?? ''

  if (runId) {
    const { data: run } = await admin
      .from('payroll_runs')
      .select('business_entity_id, period_start, period_end')
      .eq('id', runId).maybeSingle()
    if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 })
    entityId = run.business_entity_id
    from = run.period_start
    to = run.period_end
  }
  if (!entityId || !from || !to) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const { data: entity } = await admin
    .from('business_entities')
    .select('id, name, pay_config, xero_tenant_id')
    .eq('id', entityId).maybeSingle()
  if (!entity?.xero_tenant_id) {
    return NextResponse.json({ error: 'not_connected', hint: 'Connect this entity to Xero first.' }, { status: 400 })
  }

  // 1. Aggregate our timesheet hours into per-employee pay bands.
  const { data: tsRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, profiles(name, email)')
    .eq('business_entity_id', entity.id)
    .gte('work_date', from).lte('work_date', to)
    .in('status', ['submitted', 'approved'])

  const { data: holRows } = await admin
    .from('public_holidays').select('date').gte('date', from).lte('date', to)
  const holidays = new Set((holRows ?? []).map((h: any) => h.date as string))
  const employees = aggregatePayroll((tsRows ?? []) as any, holidays, entity.pay_config as PayConfig)

  // 2. Pull Xero employees + earnings rates + (if required) job tracking.
  const token = await getValidXeroToken(entity.xero_tenant_id)
  const [xeroEmployees, xeroRates, tracking] = await Promise.all([
    fetchXeroEmployees(token, entity.xero_tenant_id),
    fetchXeroEarningsRates(token, entity.xero_tenant_id),
    fetchTimesheetTracking(token, entity.xero_tenant_id),
  ])

  // If the org requires timesheet job tracking, we must attach a TrackingItemID.
  // We use the first available "Job" option as the default (aggregation loses the
  // per-project split). If tracking is required but no option is available (scope
  // missing), we report a clear error instead of a cryptic Xero one.
  const trackingRequired = !!tracking.categoryId
  const defaultTrackingId = tracking.options[0]?.id ?? null

  const byEmail = new Map(xeroEmployees.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]))
  const byName = new Map(xeroEmployees.map((e) => [e.name.toLowerCase(), e]))
  const nDays = daysInPeriod(from, to)

  const results: any[] = []

  // If tracking is required but we couldn't load any job options, stop early
  // with a clear message (usually the accounting.settings.read scope is missing).
  if (trackingRequired && !defaultTrackingId) {
    return NextResponse.json({
      error: 'tracking_required',
      hint: 'This Xero org requires a job/tracking item on timesheets, but no tracking options are available. Add the accounting.settings.read scope (and re-authorise), or disable timesheet tracking in Xero payroll settings.',
    }, { status: 400 })
  }

  for (const emp of employees) {
    const xe = (emp.email && byEmail.get(emp.email.toLowerCase())) || byName.get(emp.name.toLowerCase())
    if (!xe) {
      results.push({ employee: emp.name, ok: false, reason: 'No matching Xero employee (check name/email).' })
      continue
    }

    // Build one timesheet line per band that has hours + a matching Xero rate.
    const lines = []
    const unmapped: string[] = []
    for (const band of PAY_BANDS) {
      const hours = emp.bandHours[band] ?? 0
      if (hours <= 0) continue
      const rateId = matchEarningsRateId(band, xeroRates)
      if (!rateId) { unmapped.push(band); continue }
      // NumberOfUnits is a per-day array; place the total on the last day.
      const units = new Array(nDays).fill(0)
      units[nDays - 1] = Math.round(hours * 100) / 100
      lines.push({ earningsRateId: rateId, numberOfUnits: units, trackingItemId: trackingRequired ? defaultTrackingId : undefined })
    }

    if (lines.length === 0) {
      results.push({ employee: emp.name, ok: false, reason: `No mappable earnings rates (unmapped: ${unmapped.join(', ') || 'none'}).` })
      continue
    }

    const res = await postXeroTimesheet(token, entity.xero_tenant_id, {
      employeeId: xe.id, startDate: from, endDate: to, lines,
    })
    results.push({
      employee: emp.name,
      ok: res.ok,
      status: res.status,
      unmapped: unmapped.length ? unmapped : undefined,
      error: res.ok ? undefined : (res.body?.Elements?.[0]?.ValidationErrors ?? res.body?.Message ?? res.body),
    })
  }

  const pushed = results.filter((r) => r.ok).length

  // ── Also push approved LEAVE that overlaps this period ──────────────────────
  const leaveResults: any[] = []
  const { data: leaves } = await admin
    .from('leave_requests')
    .select('profile_id, leave_type, start_date, end_date, profiles(name, email, business_access)')
    .eq('status', 'approved')
    .lte('start_date', to).gte('end_date', from)

  const leaveRows = (leaves ?? []).filter((l: any) => (l.profiles?.business_access ?? []).includes(entity.id))
  if (leaveRows.length > 0) {
    const leaveTypes = await fetchXeroLeaveTypes(token, entity.xero_tenant_id)
    for (const l of leaveRows as any[]) {
      const name = l.profiles?.name ?? 'Employee'
      const xe = (l.profiles?.email && byEmail.get(l.profiles.email.toLowerCase())) || byName.get(name.toLowerCase())
      if (!xe) { leaveResults.push({ employee: name, ok: false, reason: 'No matching Xero employee.' }); continue }
      const leaveTypeId = matchLeaveTypeId(l.leave_type, leaveTypes)
      if (!leaveTypeId) { leaveResults.push({ employee: name, ok: false, reason: `No Xero leave type for "${l.leave_type}".` }); continue }
      const lr = await postXeroLeave(token, entity.xero_tenant_id, {
        employeeId: xe.id, leaveTypeId,
        title: LEAVE_TITLES[l.leave_type] ?? 'Leave',
        startDate: l.start_date, endDate: l.end_date,
      })
      leaveResults.push({
        employee: name, leaveType: l.leave_type,
        dates: l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`,
        ok: lr.ok,
        error: lr.ok ? undefined : (lr.body?.Elements?.[0]?.ValidationErrors ?? lr.body?.Message ?? lr.body),
      })
    }
  }
  const leavePushed = leaveResults.filter((r) => r.ok).length

  return NextResponse.json({
    entity: entity.name,
    period: { from, to },
    pushed,
    total: results.length,
    leavePushed,
    leaveTotal: leaveResults.length,
    note: pushed > 0 || leavePushed > 0
      ? 'Sent to Xero as drafts. Review and approve the timesheets in Xero, then run payroll — hours and leave will appear on the payslips.'
      : 'Nothing pushed. See per-employee reasons below.',
    results,
    leaveResults,
  })
}
