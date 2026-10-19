import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { PAY_BANDS, PAY_BAND_LABELS, type PayBand } from '@/lib/payroll'
import {
  getValidXeroToken, fetchXeroEmployees, fetchXeroEarningsRates, matchEarningsRateId,
} from '@/lib/xero'
import { fetchXeroTimesheets, fetchXeroPayRuns, fetchXeroPayRunPayslips } from '@/lib/xero-verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const HOURS_TOL = 0.02
const MONEY_TOL = 0.01

/**
 * Read-only validation of a pay run against Xero (PRD task "Validate
 * matching, bands and Xero pay result"):
 *   GET /api/xero/validate?run=<payrollRunId>
 *
 * For each employee on the run: is there a matching Xero employee (email, then
 * name); do the hours per earnings rate on Xero's timesheets for the period
 * equal our band hours; and, when Xero has a pay run for the period, do the
 * wages on the payslip equal our gross. Nothing is written to Xero.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const runId = req.nextUrl.searchParams.get('run')
  if (!runId) return NextResponse.json({ error: 'missing_params', hint: 'Pass ?run=<id>.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: run } = await admin
    .from('payroll_runs')
    .select('id, period_start, period_end, business_entity_id, business_entities(name, xero_tenant_id), payroll_entries(profile_id, band_hours, gross_pay, allowances, profiles(name, email))')
    .eq('id', runId)
    .maybeSingle()
  if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 })
  const entity = (run as any).business_entities
  if (!entity?.xero_tenant_id) {
    return NextResponse.json({ error: 'not_connected', hint: 'Connect this entity to Xero first (Entities → Connect Xero).' }, { status: 400 })
  }
  const from = (run as any).period_start as string
  const to = (run as any).period_end as string

  try {
    const token = await getValidXeroToken(entity.xero_tenant_id)
    const [xeroEmployees, xeroRates, timesheets] = await Promise.all([
      fetchXeroEmployees(token, entity.xero_tenant_id),
      fetchXeroEarningsRates(token, entity.xero_tenant_id),
      fetchXeroTimesheets(token, entity.xero_tenant_id, from, to),
    ])
    const byEmail = new Map(xeroEmployees.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]))
    const byName = new Map(xeroEmployees.map((e) => [e.name.toLowerCase(), e]))
    const rateName = new Map(xeroRates.map((r) => [r.id, r.name]))

    // Pay runs / payslips are best-effort: the Custom Connection may not have
    // the payroll.payruns scope, in which case we still compare the timesheets.
    let payRun: { id: string; status: string; periodStart: string; periodEnd: string } | null = null
    let payRunNote: string | undefined
    let payslips: Awaited<ReturnType<typeof fetchXeroPayRunPayslips>> = []
    try {
      const payRuns = await fetchXeroPayRuns(token, entity.xero_tenant_id, from, to)
      payRun = payRuns[0] ?? null
      if (payRun) payslips = await fetchXeroPayRunPayslips(token, entity.xero_tenant_id, payRun.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      payRunNote = /401|403|unauthori/i.test(msg)
        ? 'Xero did not allow reading pay runs (add the payroll.payruns scope to the Custom Connection to compare gross pay). Hours were still compared.'
        : `Could not read Xero pay runs: ${msg.slice(0, 160)}`
    }
    const slipByEmployee = new Map(payslips.map((p) => [p.employeeId, p]))

    const employees = ((run as any).payroll_entries as any[])
      .sort((a, b) => String(a.profiles?.name ?? '').localeCompare(String(b.profiles?.name ?? '')))
      .map((e) => {
        const name = e.profiles?.name ?? 'Unknown'
        const email = (e.profiles?.email ?? '').toLowerCase()
        const xe = (email && byEmail.get(email)) || byName.get(name.toLowerCase())
        const bh = (e.band_hours ?? {}) as Record<string, number>
        const oursGross = Number(e.gross_pay ?? 0)

        // Our hours per Xero earnings rate (same mapping as the push).
        const ours = new Map<string, number>()
        const unmapped: PayBand[] = []
        for (const b of PAY_BANDS) {
          const h = Number(bh[b] ?? 0)
          if (h <= 0) continue
          const rid = matchEarningsRateId(b, xeroRates)
          if (!rid) { unmapped.push(b); continue }
          ours.set(rid, round2((ours.get(rid) ?? 0) + h))
        }

        if (!xe) {
          return {
            employee: name, matched: false, lines: [], oursTotal: round2([...ours.values()].reduce((s, v) => s + v, 0)), xeroTotal: 0,
            hoursMatch: false, oursGross, xeroWages: null, grossMatch: null,
            note: 'No matching employee in Xero payroll (check name and email).',
          }
        }

        // Xero hours per earnings rate across this employee's timesheets in the period.
        const mine = timesheets.filter((t) => t.employeeId === xe.id)
        const xero = new Map<string, number>()
        for (const t of mine) for (const l of t.lines) {
          const total = l.units.reduce((s, u) => s + u, 0)
          xero.set(l.earningsRateId, round2((xero.get(l.earningsRateId) ?? 0) + total))
        }
        const rateIds = new Set([...ours.keys(), ...xero.keys()])
        const lines = [...rateIds].map((rid) => {
          const o = ours.get(rid) ?? 0
          const x = xero.get(rid) ?? 0
          return { rate: rateName.get(rid) ?? rid, ours: o, xero: x, match: Math.abs(o - x) <= HOURS_TOL }
        }).sort((a, b) => a.rate.localeCompare(b.rate))
        const oursTotal = round2([...ours.values()].reduce((s, v) => s + v, 0))
        const xeroTotal = round2([...xero.values()].reduce((s, v) => s + v, 0))
        const hoursMatch = lines.length > 0 && lines.every((l) => l.match)

        const slip = slipByEmployee.get(xe.id)
        const xeroWages = slip ? round2(slip.wages) : null
        const grossMatch = xeroWages == null ? null : Math.abs(xeroWages - oursGross) <= MONEY_TOL

        const notes: string[] = []
        if (mine.length === 0) notes.push('No Xero timesheet for this period yet — push the run first.')
        if (unmapped.length) notes.push(`No Xero earnings rate for: ${unmapped.map((b) => PAY_BAND_LABELS[b]).join(', ')}.`)
        if (xeroWages != null && grossMatch === false) notes.push('Xero wages differ from our gross — check the employee\'s pay template rate and allowances in Xero.')

        return {
          employee: name, matched: true, xeroStatus: mine[0]?.status, lines, oursTotal, xeroTotal, hoursMatch,
          oursGross, xeroWages, grossMatch, note: notes.join(' ') || undefined,
        }
      })

    const summary = {
      employees: employees.length,
      unmatched: employees.filter((e) => !e.matched).length,
      hoursMatched: employees.filter((e) => e.hoursMatch).length,
      grossMatched: payRun ? employees.filter((e) => e.grossMatch === true).length : null,
    }

    return NextResponse.json({
      entity: entity.name,
      period: { from, to },
      timesheetsFound: timesheets.length,
      payRun: payRun ? { id: payRun.id, status: payRun.status, period: `${payRun.periodStart} – ${payRun.periodEnd}` } : null,
      payRunNote,
      employees,
      summary,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Xero lookup failed.' }, { status: 502 })
  }
}
