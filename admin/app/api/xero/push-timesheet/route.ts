import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { aggregatePayrollByDay, PAY_BANDS, type PayConfig } from '@/lib/payroll'
import {
  getValidXeroToken,
  fetchXeroEmployees,
  fetchXeroEarningsRates,
  fetchXeroLeaveTypes,
  fetchTimesheetTracking,
  fetchXeroPayCalendars,
  fetchXeroEmployeeCalendarId,
  alignToOneCalendar,
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
  const employees = aggregatePayrollByDay((tsRows ?? []) as any, holidays, entity.pay_config as PayConfig)

  // 2. Pull Xero employees + earnings rates + (if required) job tracking + calendars.
  const token = await getValidXeroToken(entity.xero_tenant_id)
  const [xeroEmployees, xeroRates, tracking, calendars] = await Promise.all([
    fetchXeroEmployees(token, entity.xero_tenant_id),
    fetchXeroEarningsRates(token, entity.xero_tenant_id),
    fetchTimesheetTracking(token, entity.xero_tenant_id),
    fetchXeroPayCalendars(token, entity.xero_tenant_id),
  ])

  // Xero only accepts a timesheet whose dates align exactly with the employee's
  // pay-calendar period. Our pay run's period may not (it can start mid-week), so
  // we snap the timesheet window to that calendar per employee (below). The org
  // may have several calendars; a single one is the common fallback.
  const calendarById = new Map(calendars.map((c) => [c.id, c]))
  const soleCalendar = calendars.length === 1 ? calendars[0] : null
  const calIdCache = new Map<string, string | null>()

  // If the org requires timesheet job tracking, we must attach a TrackingItemID.
  // We use the first available "Job" option as the default (aggregation loses the
  // per-project split). If tracking is required but no option is available (scope
  // missing), we report a clear error instead of a cryptic Xero one.
  const trackingRequired = !!tracking.categoryId
  const defaultTrackingId = tracking.options[0]?.id ?? null

  const byEmail = new Map(xeroEmployees.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]))
  const byName = new Map(xeroEmployees.map((e) => [e.name.toLowerCase(), e]))

  const results: any[] = []
  let lastXeroFrom = from
  let lastXeroTo = to

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

    // Snap the timesheet window to THIS employee's pay calendar (Xero rejects a
    // timesheet whose dates don't match the employee's calendar period exactly).
    let calId = xe.payrollCalendarId
    if (!calId && calIdCache.has(xe.id)) calId = calIdCache.get(xe.id) ?? null
    if (!calId) {
      calId = await fetchXeroEmployeeCalendarId(token, entity.xero_tenant_id, xe.id)
      calIdCache.set(xe.id, calId)
    }
    const cal = (calId && calendarById.get(calId)) || soleCalendar
    const aligned = cal ? alignToOneCalendar(from, to, cal) : null
    const xeroFrom = aligned?.from ?? from
    const xeroTo = aligned?.to ?? to
    lastXeroFrom = xeroFrom
    lastXeroTo = xeroTo
    const nDays = daysInPeriod(xeroFrom, xeroTo)
    // Index each aligned-period date (YYYY-MM-DD) → its slot in NumberOfUnits.
    const startMs = new Date(xeroFrom + 'T00:00:00Z').getTime()
    const dayIndex = (date: string) =>
      Math.round((new Date(date + 'T00:00:00Z').getTime() - startMs) / 86_400_000)

    // Build one timesheet line per band that has hours + a matching Xero rate,
    // placing each day's hours on its actual day within the aligned period.
    const lines = []
    const unmapped: string[] = []
    for (const band of PAY_BANDS) {
      const perDay = emp.byBand[band] ?? {}
      const bandTotal = Object.values(perDay).reduce((a, b) => a + b, 0)
      if (bandTotal <= 0) continue
      const rateId = matchEarningsRateId(band, xeroRates)
      if (!rateId) { unmapped.push(band); continue }
      // NumberOfUnits is a per-day array over the aligned period.
      const units = new Array(nDays).fill(0)
      let placed = 0
      for (const [date, h] of Object.entries(perDay)) {
        const i = dayIndex(date)
        if (i >= 0 && i < nDays) { units[i] = Math.round((units[i] + h) * 100) / 100; placed += h }
      }
      // Any hours whose date fell outside the aligned window go on the last day,
      // so the total is never lost (edge case: run period vs. calendar mismatch).
      const leftover = Math.round((bandTotal - placed) * 100) / 100
      if (leftover > 0) units[nDays - 1] = Math.round((units[nDays - 1] + leftover) * 100) / 100
      lines.push({ earningsRateId: rateId, numberOfUnits: units, trackingItemId: trackingRequired ? defaultTrackingId : undefined })
    }

    if (lines.length === 0) {
      results.push({ employee: emp.name, ok: false, reason: `No mappable earnings rates (unmapped: ${unmapped.join(', ') || 'none'}).` })
      continue
    }

    const res = await postXeroTimesheet(token, entity.xero_tenant_id, {
      employeeId: xe.id, startDate: xeroFrom, endDate: xeroTo, lines,
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
    xeroPeriod: { from: lastXeroFrom, to: lastXeroTo },
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
