import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/server'
import { getViewer, NO_ROWS_ID } from '@/lib/viewer'
import { labourCost } from '@/lib/labour-cost'
import { toXlsx, toCsv, fmtMelbourne } from '@/lib/report-rows'
import { TimesheetsPdf, type TimesheetPdfRow } from '@/lib/timesheets-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: true }) : ''
const fmtDay = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * TV10 — Download timesheets: any employee or all employees, any period, as
 * Excel or PDF (CSV too). Rows are clock-session timesheets with the engine's
 * regular / overtime split (break, 7.6 h cap, overtime pending until approved)
 * and the overtime approver's name and time.
 *
 *   GET /api/timesheets/export?format=xlsx|pdf|csv&from=YYYY-MM-DD&to=YYYY-MM-DD[&employee=][&entity=]
 */
export async function GET(req: NextRequest) {
  let viewer
  try { viewer = await getViewer() } catch { return NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const format = (sp.get('format') ?? 'xlsx').toLowerCase()
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  const employeeId = sp.get('employee') || undefined
  const entityId = sp.get('entity') || undefined
  if (!ISO.test(from) || !ISO.test(to) || from > to) return NextResponse.json({ error: 'bad_range' }, { status: 400 })
  if (!['xlsx', 'pdf', 'csv'].includes(format)) return NextResponse.json({ error: 'bad_format' }, { status: 400 })
  // Supervisors may only export their own team.
  if (viewer.teamIds && employeeId && !viewer.teamIds.includes(employeeId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Everything except rejected attendance (those hours are never paid).
  let q = admin
    .from('timesheets')
    .select('id, profile_id, work_date, hours, business_entity_id, project_id, work_location, overtime_status, status, clock_session_id, profiles!inner(name, status), projects(name), business_entities(name), clock_sessions(clocked_in_at, clocked_out_at, review_status, auto_closed)')
    .gte('work_date', from).lte('work_date', to)
    .neq('status', 'rejected')
    .order('work_date').order('profile_id')
  if (employeeId) q = q.eq('profile_id', employeeId)
  if (entityId) q = q.eq('business_entity_id', entityId)
  if (viewer.teamIds) q = q.in('profile_id', viewer.teamIds.length ? viewer.teamIds : [NO_ROWS_ID])
  const { data: tsRows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rowsRaw = (tsRows ?? []) as any[]

  // Overtime requests → approver + time.
  const otIds = rowsRaw.filter((t) => t.overtime_status && t.overtime_status !== 'none').map((t) => t.id)
  const approver = new Map<string, { name: string; at: string | null; status: string }>()
  if (otIds.length) {
    const { data: ots } = await admin.from('overtime_requests').select('timesheet_id, status, supervisor_id, decided_by, decided_at').in('timesheet_id', otIds)
    const ids = [...new Set((ots ?? []).flatMap((o: any) => [o.decided_by, o.supervisor_id]).filter(Boolean))]
    const { data: names } = ids.length ? await admin.from('profiles').select('id, name').in('id', ids) : { data: [] }
    const nm = new Map((names ?? []).map((p: any) => [p.id, p.name as string]))
    for (const o of (ots ?? []) as any[]) {
      const who = o.decided_by ?? o.supervisor_id
      approver.set(o.timesheet_id, { name: who ? (nm.get(who) ?? '') : '', at: o.decided_at, status: o.status })
    }
  }

  // Engine split per employee-day (same rules as payroll), apportioned to each row by hours.
  const cost = await labourCost(admin, { from, to, employeeId, statuses: ['approved', 'submitted', 'locked'] })
  const dayMap = new Map(cost.days.map((d) => [`${d.profileId}|${d.date}|${d.entityId}`, d]))

  const rows: TimesheetPdfRow[] = rowsRaw.map((t) => {
    const d = dayMap.get(`${t.profile_id}|${t.work_date}|${t.business_entity_id}`)
    const share = d && d.hours > 0 ? Number(t.hours) / d.hours : 1
    const a = approver.get(t.id)
    return {
      date: t.work_date,
      employee: t.profiles?.name ?? '',
      company: t.business_entities?.name ?? '',
      project: t.projects?.name ?? '',
      location: t.work_location === 'workshop' ? 'Factory' : 'Site',
      clockIn: fmtTime(t.clock_sessions?.clocked_in_at ?? null),
      clockOut: fmtTime(t.clock_sessions?.clocked_out_at ?? null),
      worked: Number(t.hours),
      breakHours: d ? r2(d.breakHours * share) : 0,
      regular: d ? r2(d.bandHours.regular * share) : 0,
      overtime: d ? r2((d.bandHours.overtime_t1 + d.bandHours.overtime_t2 + d.bandHours.saturday + d.bandHours.sunday + d.bandHours.public_holiday) * share) : 0,
      pendingOvertime: d ? r2(d.pendingOvertimeHours * share) : 0,
      otStatus: t.overtime_status ?? 'none',
      approver: a?.name ?? '',
      decidedAt: fmtMelbourne(a?.at ?? null),
      attendance: t.status === 'approved' ? 'Approved' : t.status === 'locked' ? 'Paid' : t.clock_sessions?.review_status === 'pending' ? 'Awaiting review' : 'Submitted',
      autoClosed: !!t.clock_sessions?.auto_closed,
    }
  })

  const headers = ['Date', 'Employee', 'Company', 'Project', 'Location', 'Clock in', 'Clock out', 'Hours worked', 'Unpaid break (h)', 'Regular (h)', 'Overtime (h)', 'OT awaiting approval (h)', 'Overtime status', 'Approver', 'Decided at', 'Attendance', 'Auto clock-out']
  const flat = rows.map((r) => [r.date, r.employee, r.company, r.project, r.location, r.clockIn, r.clockOut, r.worked, r.breakHours, r.regular, r.overtime, r.pendingOvertime, r.otStatus, r.approver, r.decidedAt, r.attendance, r.autoClosed ? 'yes' : ''])

  let who = 'All employees'
  if (employeeId) who = rows[0]?.employee ?? (await admin.from('profiles').select('name').eq('id', employeeId).maybeSingle()).data?.name ?? 'Employee'
  let company = ''
  if (entityId) company = (await admin.from('business_entities').select('name').eq('id', entityId).maybeSingle()).data?.name ?? ''
  const label = `${who}${company ? ` · ${company}` : ''} · ${fmtDay(from)} – ${fmtDay(to)}`
  const base = `timesheets-${employeeId ? who.replace(/\s+/g, '-').toLowerCase() : 'all'}-${from}-to-${to}`

  if (format === 'csv') {
    return new NextResponse(toCsv(headers, flat), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.csv"`, 'Cache-Control': 'no-store' },
    })
  }
  if (format === 'xlsx') {
    const buf = await toXlsx('Timesheets', headers, flat, `Timesheets · ${label}`)
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"`, 'Cache-Control': 'no-store' },
    })
  }

  // PDF: one section per employee.
  const byEmp = new Map<string, TimesheetPdfRow[]>()
  for (const r of rows) byEmp.set(r.employee, [...(byEmp.get(r.employee) ?? []), r])
  const sections = [...byEmp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([title, rs]) => ({ title, rows: rs }))
  const generatedAt = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' })
  const pdf = await renderToBuffer(TimesheetsPdf({ heading: 'Timesheets', meta: label, generatedAt, sections }))
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${sp.get('view') ? 'inline' : 'attachment'}; filename="${base}.pdf"`, 'Cache-Control': 'no-store' },
  })
}
