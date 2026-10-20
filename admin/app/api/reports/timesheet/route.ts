import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/server'
import { TimesheetPdf, type TimesheetRow } from '@/lib/timesheet-pdf'
import { labourCost } from '@/lib/labour-cost'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


const fmtDay = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')

const fmtRange = (from: string, to: string) => {
  const f = new Date(from + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const t = new Date(to + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f} – ${t}`
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Individual employee fortnightly timesheet PDF.
 *   /api/reports/timesheet?employee=<profileId>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Built from clock_sessions (clock in/out, location, project). Regular /
 * overtime come from the shared pay engine: 30 min break on days of 5 h or
 * more, 7.6 h regular a day, overtime paid once approved (pending overtime is
 * counted in "total" but not in "overtime").
 */
export async function GET(req: NextRequest) {
  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const employeeId = sp.get('employee')
  const from = sp.get('from')
  const to = sp.get('to')

  if (!employeeId || !from || !to) {
    return new Response('Missing employee, from or to.', { status: 400 })
  }

  const [{ data: profile }, { data: sessions }] = await Promise.all([
    admin.from('profiles').select('name, email').eq('id', employeeId).maybeSingle(),
    admin
      .from('clock_sessions')
      .select('work_date, work_location, clocked_in_at, clocked_out_at, review_status, projects(name), business_entities(name)')
      .eq('profile_id', employeeId)
      .gte('work_date', from)
      .lte('work_date', to)
      .eq('review_status', 'approved') // only approved attendance appears; pending is not yet payable
      .order('clocked_in_at', { ascending: true }),
  ])

  const raw = (sessions ?? []) as any[]

  // The engine's per-day figures (same rules as payroll), shared out across the
  // day's sessions by hours worked.
  const cost = await labourCost(admin, { from, to, employeeId, statuses: ['approved', 'locked'] })
  const dayHours = new Map<string, number>()
  const dayRegular = new Map<string, number>()
  const dayOvertime = new Map<string, number>()
  for (const d of cost.days) {
    dayHours.set(d.date, round2((dayHours.get(d.date) ?? 0) + d.hours))
    dayRegular.set(d.date, round2((dayRegular.get(d.date) ?? 0) + d.bandHours.regular))
    dayOvertime.set(d.date, round2((dayOvertime.get(d.date) ?? 0) + d.overtimeHours))
  }

  const rows: TimesheetRow[] = []
  let entityName = '—'

  for (const s of raw) {
    if (s.business_entities?.name) entityName = s.business_entities.name
    const worked = s.clocked_out_at
      ? Math.max(0, Math.round(((new Date(s.clocked_out_at).getTime() - new Date(s.clocked_in_at).getTime()) / 60_000)) / 60)
      : 0
    const total = dayHours.get(s.work_date) ?? 0
    const share = total > 0 ? worked / total : 0
    const regular = round2((dayRegular.get(s.work_date) ?? 0) * share)
    const overtime = round2((dayOvertime.get(s.work_date) ?? 0) * share)

    rows.push({
      date: fmtDay(s.work_date),
      clockIn: fmtTime(s.clocked_in_at),
      clockOut: fmtTime(s.clocked_out_at),
      location: s.work_location === 'site' ? 'Onsite' : s.work_location === 'workshop' ? 'Offsite' : '—',
      project: s.projects?.name ?? '—',
      regularHours: regular,
      overtimeHours: overtime,
      totalHours: round2(worked),
    })
  }

  // Load the Build One + ARKO logos as data URIs (react-pdf needs an inline source).
  const loadLogo = async (file: string): Promise<string> => {
    try {
      const buf = await readFile(path.join(process.cwd(), 'public', file))
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      return ''
    }
  }
  const [buildOneLogo, arkoLogo] = await Promise.all([
    loadLogo('buildone.png'),
    loadLogo('Arko logo.png'),
  ])

  const generatedAt = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const buffer = await renderToBuffer(
    TimesheetPdf({
      buildOneLogo,
      arkoLogo,
      employeeName: profile?.name ?? 'Employee',
      employeeEmail: profile?.email ?? '',
      entityName,
      periodLabel: fmtRange(from, to),
      generatedAt,
      rows,
    }),
  )

  const safeName = (profile?.name ?? 'employee').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const fileName = `timesheet-${safeName}-${from}-to-${to}.pdf`

  return new Response(buffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
