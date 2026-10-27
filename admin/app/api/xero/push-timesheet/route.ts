import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { PAY_BANDS } from '@/lib/payroll'
import { aggregateEmployeeBandsByDay, employerMap, normalizePayConfig } from '@/lib/labour-cost'
import {
  getValidXeroToken,
  fetchXeroEmployees,
  fetchXeroEarningsRates,
  fetchXeroLeaveTypes,
  fetchTimesheetTracking,
  fetchXeroPayCalendars,
  fetchXeroEmployeeCalendarId,
  fetchXeroTimesheets,
  fetchXeroLeaveApplications,
  decideExistingTimesheet,
  alignToOneCalendar,
  matchEarningsRateId,
  matchLeaveTypeId,
  postXeroTimesheet,
  postXeroLeave,
  type XeroTimesheetLine,
} from '@/lib/xero'

const LEAVE_TITLES: Record<string, string> = {
  annual: 'Annual Leave', sick: 'Sick / Personal Leave', personal: 'Personal Leave', unpaid: 'Unpaid Leave',
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Flatten a Xero error body to a readable message. */
function xeroErrorText(body: any): string {
  const v = body?.Elements?.[0]?.ValidationErrors
  if (Array.isArray(v) && v.length) return v.map((e: any) => e?.Message ?? String(e)).join('; ')
  if (body?.Message) return String(body.Message)
  return typeof body === 'string' ? body : JSON.stringify(body)
}

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
  const { data: me } = await supabase.from('profiles').select('role, portal_admin').eq('id', user.id).maybeSingle()
  if (!(me?.role === 'admin' || me?.portal_admin === true)) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const runId = sp.get('run')
  // ?dryRun=1 — do every read and decision but write nothing to Xero or the run
  // (used to check what a push WOULD do: create / update / keep / skip).
  const dryRun = sp.get('dryRun') === '1'
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

  // PRD §16 sync status: mark the run pending while we talk to Xero, then
  // success / failed below. Any thrown error also lands as 'failed'.
  // The outcome is recorded ON the run (xero_sync_note, 0033) so the pay-run
  // list says why a push is "Partly sent" or "Failed", not just the word.
  const setSync = async (status: 'pending' | 'success' | 'partial' | 'failed', exported = false, note?: string) => {
    if (!runId) return
    const patch: Record<string, unknown> = { xero_sync_status: status }
    if (exported) patch.status = 'exported'
    if (note !== undefined) { patch.xero_sync_note = note.slice(0, 2000); patch.xero_synced_at = new Date().toISOString() }
    await admin.from('payroll_runs').update(patch).eq('id', runId)
  }
  // 1. Aggregate our timesheet hours into per-employee pay bands. overtime_status
  //    feeds the entity's "overtime must be approved" rule (PRD §10). Rows from
  //    every entity are loaded so the unpaid break is deducted once per day;
  //    only this entity's rows contribute hours (see aggregateEmployeeBandsByDay).
  const { data: tsRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, overtime_status, business_entity_id, profiles!inner(name, email, flat_rate, status, employer_entity_id, xero_payroll, unpaid_break_exempt)')
    .eq('profiles.status', 'active') // deactivated staff are never pushed
    .gte('work_date', from).lte('work_date', to)
    .eq('status', 'approved') // only approved attendance is paid

  const { data: holRows } = await admin
    .from('public_holidays').select('date').gte('date', from).lte('date', to)
  const holidays = new Set((holRows ?? []).map((h: any) => h.date as string))
  // Flat-rate workers: all hours on the ordinary band, so Xero gets no
  // overtime/weekend lines for them.
  const flatRateIds = new Set(
    ((tsRows ?? []) as any[]).filter((r) => r.profiles?.flat_rate).map((r) => r.profile_id as string),
  )
  // People not paid through Xero (directors, anyone paid another way): their
  // hours still cost the project, but the push lists them as skipped instead
  // of failing the whole run because Xero has no such employee.
  const notOnXero = new Set(
    ((tsRows ?? []) as any[]).filter((r) => r.profiles?.xero_payroll === false).map((r) => r.profile_id as string),
  )
  // TV6: an employee's hours go to their EMPLOYER's Xero payroll, whichever company's project they worked on.
  const employees = aggregateEmployeeBandsByDay((tsRows ?? []) as any, holidays, normalizePayConfig(entity.pay_config), flatRateIds, { entityId: entity.id, employerOf: employerMap((tsRows ?? []) as any) })

  // The hours sent to Xero are recomputed from attendance, so they must match
  // what the run page / PDF / CSV show. If attendance was approved (or the pay
  // rules changed) after the run was created, make the admin Recalculate first
  // instead of silently sending different figures.
  if (runId) {
    const { data: stored } = await admin.from('payroll_entries').select('profile_id, band_hours').eq('payroll_run_id', runId)
    const storedMap = new Map(((stored ?? []) as any[]).map((e) => [e.profile_id as string, (e.band_hours ?? {}) as Record<string, number>]))
    const drift = new Set<string>()
    for (const emp of employees) {
      const s = storedMap.get(emp.profileId)
      if (!s) { drift.add(emp.name); continue }
      for (const band of PAY_BANDS) {
        const now = Object.values(emp.byBand[band] ?? {}).reduce((a, b) => a + b, 0)
        if (Math.abs(now - Number(s[band] || 0)) > 0.011) { drift.add(emp.name); break }
      }
    }
    for (const pid of storedMap.keys()) if (!employees.some((e) => e.profileId === pid)) drift.add('an employee no longer on the run')
    if (drift.size > 0) {
      // `error` is what the Push dialog shows, so it carries the plain-English text.
      return NextResponse.json({
        code: 'run_out_of_date',
        error: `The hours on this run no longer match the approved attendance (${[...drift].join(', ')}). Click Recalculate on the run, check it, then push again.`,
      }, { status: 409 })
    }
  }

  // 'partial' = some people went through and some did not (the run keeps its
  // draft status; push again after fixing the reasons). 'failed' = nothing sent.
  const failRun = async (reason: string, status: 'failed' | 'partial' = 'failed') => {
    await setSync(status, false, reason)
    // PRD §18 admin notification: "Failed Xero Sync".
    const { data: admins } = await admin.from('profiles').select('id').or('role.eq.admin,portal_admin.eq.true').eq('status', 'active')
    const rows = (admins ?? []).map((a: any) => ({
      profile_id: a.id, type: 'xero_sync_failed',
      title: `${status === 'partial' ? 'Xero push partly sent' : 'Xero push failed'} — ${entity.name}`,
      body: `${from} – ${to}: ${reason}`.slice(0, 500),
    }))
    if (rows.length) await admin.from('notifications').insert(rows)
  }
  if (!dryRun) await setSync('pending')

  try {
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

  // Attach a TrackingItemID up front only when payroll Settings names a timesheet
  // category (first option; aggregation loses the per-project split). Otherwise
  // send none, and let the retry below add the fallback if Xero insists.
  const defaultTrackingId = tracking.required ? (tracking.options[0]?.id ?? null) : null
  const fallbackTrackingId = tracking.fallbackOptions[0]?.id ?? null

  const byEmail = new Map(xeroEmployees.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]))
  const byName = new Map(xeroEmployees.map((e) => [e.name.toLowerCase(), e]))

  const results: any[] = []
  let lastXeroFrom = from
  let lastXeroTo = to

  for (const emp of employees) {
    if (notOnXero.has(emp.profileId)) {
      results.push({ employee: emp.name, ok: true, action: 'skipped', note: 'Not paid through Xero payroll (Employees → Edit → "Paid through Xero payroll").' })
      continue
    }
    const xe = (emp.email && byEmail.get(emp.email.toLowerCase())) || byName.get(emp.name.toLowerCase())
    if (!xe) {
      results.push({ employee: emp.name, ok: false, reason: `Not in ${entity.name}'s Xero payroll — add them in Xero with the same name or email, or untick "Paid through Xero payroll" on their profile if they are paid another way.` })
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
    const lines: XeroTimesheetLine[] = []
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
      lines.push({ earningsRateId: rateId, numberOfUnits: units, trackingItemId: defaultTrackingId })
    }

    if (lines.length === 0) {
      results.push({ employee: emp.name, ok: false, reason: `No mappable earnings rates (unmapped: ${unmapped.join(', ') || 'none'}).` })
      continue
    }

    // Idempotent push: look at what Xero already holds for this employee and
    // period. A draft from an earlier (partly failed) push is UPDATED in place;
    // a timesheet the client has already approved or paid is left alone and
    // counts as done when the hours agree. This is what used to fail with
    // "This timesheet already exists, please provide the timesheet ID".
    const ourHours = Math.round(lines.reduce((a, l) => a + l.numberOfUnits.reduce((x, y) => x + y, 0), 0) * 100) / 100
    const existing = await fetchXeroTimesheets(token, entity.xero_tenant_id, xe.id)
    const decision = decideExistingTimesheet(existing, { startDate: xeroFrom, endDate: xeroTo }, ourHours)
    if (decision.action === 'keep') {
      const label = decision.status === 'PROCESSED' ? 'already paid in Xero' : 'already approved in Xero'
      if (decision.status === 'PROCESSED') {
        // Paid: Xero will not change it, so it never blocks the run. A
        // difference is shown as a warning for the next Xero pay run.
        results.push({
          employee: emp.name, ok: true, action: 'paid', unmapped: unmapped.length ? unmapped : undefined,
          note: `${label} (${decision.xeroHours} h) — not changed.`,
          warning: decision.mismatch ? `This run has ${ourHours} h but Xero paid ${decision.xeroHours} h — adjust the difference in the next Xero pay run.` : undefined,
        })
      } else if (decision.mismatch) {
        // Approved but not yet paid: the client can still revert it to draft in Xero.
        results.push({
          employee: emp.name, ok: false, action: 'mismatch', status: decision.status,
          reason: `${label} with ${decision.xeroHours} h, but this run has ${ourHours} h. Revert it to draft in Xero and push again, or accept the Xero figure.`,
        })
      } else {
        results.push({ employee: emp.name, ok: true, action: 'approved', note: `${label} (${decision.xeroHours} h) — not changed.`, unmapped: unmapped.length ? unmapped : undefined })
      }
      continue
    }
    const timesheetId = decision.action === 'update' ? decision.timesheetId : null
    const actionLabel = timesheetId ? 'updated' : 'created'
    if (dryRun) {
      results.push({ employee: emp.name, ok: true, action: `would be ${actionLabel}`, note: `${ourHours} h, ${xeroFrom} – ${xeroTo}`, unmapped: unmapped.length ? unmapped : undefined })
      continue
    }

    const post = (trackingItemId: string | null) => postXeroTimesheet(token, entity.xero_tenant_id, {
      employeeId: xe.id, startDate: xeroFrom, endDate: xeroTo, timesheetId,
      lines: lines.map((l) => ({ ...l, trackingItemId })),
    })
    let res = await post(defaultTrackingId)
    // Self-correct tracking once, based on what Xero tells us:
    //  - it wants a TrackingItemID we didn't send → retry with the fallback Job option
    //  - it doesn't recognise the option we sent → retry without tracking
    if (!res.ok) {
      const msg = xeroErrorText(res.body)
      if (!defaultTrackingId && fallbackTrackingId && /TrackingItemID is required/i.test(msg)) {
        res = await post(fallbackTrackingId)
      } else if (defaultTrackingId && /Tracking Option .* does not exist/i.test(msg)) {
        res = await post(null)
      }
    }
    results.push({
      employee: emp.name,
      ok: res.ok,
      action: res.ok ? actionLabel : undefined,
      note: res.ok ? `${ourHours} h as a draft, ${xeroFrom} – ${xeroTo}` : undefined,
      status: res.status,
      unmapped: unmapped.length ? unmapped : undefined,
      error: res.ok ? undefined : xeroErrorText(res.body),
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
      // Already filed by an earlier push → do not file it twice.
      const filed = await fetchXeroLeaveApplications(token, entity.xero_tenant_id, xe.id)
      const dup = filed.find((f) => f.leaveTypeId === leaveTypeId && f.startDate === l.start_date && f.endDate === l.end_date)
      if (dup) {
        leaveResults.push({ employee: name, leaveType: l.leave_type, dates: l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`, ok: true, action: 'already in Xero' })
        continue
      }
      if (dryRun) {
        leaveResults.push({ employee: name, leaveType: l.leave_type, dates: l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`, ok: true, action: 'would be filed' })
        continue
      }
      const lr = await postXeroLeave(token, entity.xero_tenant_id, {
        employeeId: xe.id, leaveTypeId,
        title: LEAVE_TITLES[l.leave_type] ?? 'Leave',
        startDate: l.start_date, endDate: l.end_date,
      })
      leaveResults.push({
        employee: name, leaveType: l.leave_type,
        dates: l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`,
        ok: lr.ok,
        error: lr.ok ? undefined : xeroErrorText(lr.body),
      })
    }
  }
  const leavePushed = leaveResults.filter((r) => r.ok).length

  // Record the outcome on the run (PRD §16): every employee pushed → success and
  // the run becomes "exported"; anything else → failed, with an admin alert.
  const failed = results.filter((r) => !r.ok).map((r) => `${r.employee}: ${r.reason ?? (typeof r.error === 'string' ? r.error : 'error')}`)
  const sent = results.filter((r) => r.ok && (r.action === 'created' || r.action === 'updated')).length
  // Plain-English summary stored on the run: what happened to whom.
  const countBy = (a: string) => results.filter((r) => r.ok && r.action === a).length
  const parts = [
    countBy('created') && `${countBy('created')} sent`,
    countBy('updated') && `${countBy('updated')} updated`,
    countBy('approved') && `${countBy('approved')} already approved in Xero`,
    countBy('paid') && `${countBy('paid')} already paid in Xero${results.some((r) => r.action === 'paid' && r.warning) ? ` (${results.filter((r) => r.action === 'paid' && r.warning).length} with different hours — see the push result)` : ''}`,
    countBy('skipped') && `${countBy('skipped')} not paid through Xero`,
  ].filter(Boolean) as string[]
  const summary = parts.length ? parts.join(', ') : 'nothing to send'
  if (dryRun) {
    // Nothing was written; just report the plan.
  } else if (results.length > 0 && pushed === results.length) {
    await setSync('success', true, `${pushed} of ${results.length} employees: ${summary}.`)
  } else if (pushed > 0) {
    await failRun(`${failed.length} of ${results.length} employees failed — ${failed.join('; ')}. Went through: ${summary}.`, 'partial')
  } else {
    await failRun(results.length === 0 ? 'No employees with approved hours to push.' : `${failed.length} of ${results.length} employees failed — ${failed.join('; ')}`)
  }
  const note = dryRun
    ? 'Dry run — nothing was sent to Xero. This is what a push would do.'
    : results.length > 0 && pushed === results.length
      ? (sent > 0
          ? 'Done. New or updated timesheets are drafts in Xero — review and approve them there, then run payroll. Timesheets already approved or paid in Xero were left as they are.'
          : 'Done. Every timesheet for this period was already approved or paid in Xero, so nothing needed sending.')
      : `${failed.length} of ${results.length} employees could not be pushed — see the reasons below, fix them, then push again (what already went through is kept, not duplicated).`

  return NextResponse.json({
    entity: entity.name,
    period: { from, to },
    xeroPeriod: { from: lastXeroFrom, to: lastXeroTo },
    dryRun,
    pushed,
    total: results.length,
    leavePushed,
    leaveTotal: leaveResults.length,
    note,
    results,
    leaveResults,
  })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error while talking to Xero.'
    await failRun(msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
