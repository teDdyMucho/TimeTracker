import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/server'
import { TimesheetPdf, type TimesheetRow } from '@/lib/timesheet-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STANDARD_DAY = 8 // hours before overtime kicks in

const fmtDay = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')

const fmtRange = (from: string, to: string) => {
  const f = new Date(from + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const t = new Date(to + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f} – ${t}`
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Individual employee fortnightly timesheet PDF.
 *   /api/reports/timesheet?employee=<profileId>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Built from clock_sessions (clock in/out, location, project). Overtime is any
 * time worked beyond the 8-hour standard day, aggregated per calendar day.
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
      .neq('review_status', 'rejected') // rejected attendance doesn't count
      .order('clocked_in_at', { ascending: true }),
  ])

  const raw = (sessions ?? []) as any[]

  // Track per-day total worked hours so overtime (beyond 8h/day) is attributed
  // to the last session(s) of that day — mirrors how a day's OT is earned.
  const dayTotals = new Map<string, number>()
  for (const s of raw) {
    if (!s.clocked_out_at) continue
    const worked = (new Date(s.clocked_out_at).getTime() - new Date(s.clocked_in_at).getTime()) / 3_600_000
    dayTotals.set(s.work_date, round2((dayTotals.get(s.work_date) ?? 0) + Math.max(0, worked)))
  }

  const dayRunning = new Map<string, number>() // hours already allocated per day
  const rows: TimesheetRow[] = []
  let entityName = '—'

  for (const s of raw) {
    if (s.business_entities?.name) entityName = s.business_entities.name
    const worked = s.clocked_out_at
      ? Math.max(0, (new Date(s.clocked_out_at).getTime() - new Date(s.clocked_in_at).getTime()) / 3_600_000)
      : 0

    // Split this session's hours into regular vs overtime based on how much of
    // the day's 8-hour regular allowance is left before this session.
    const before = dayRunning.get(s.work_date) ?? 0
    const regularLeft = Math.max(0, STANDARD_DAY - before)
    const regular = round2(Math.min(worked, regularLeft))
    const overtime = round2(Math.max(0, worked - regular))
    dayRunning.set(s.work_date, before + worked)

    rows.push({
      date: fmtDay(s.work_date),
      clockIn: fmtTime(s.clocked_in_at),
      clockOut: fmtTime(s.clocked_out_at),
      location: s.work_location === 'site' ? 'Onsite' : s.work_location === 'factory' ? 'Offsite' : '—',
      project: s.projects?.name ?? '—',
      regularHours: regular,
      overtimeHours: overtime,
      totalHours: round2(worked),
    })
  }

  // Load the logo as a data URI.
  let logoSrc = ''
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'Timevera-Web-logo.png'))
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    logoSrc = ''
  }

  const generatedAt = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const buffer = await renderToBuffer(
    TimesheetPdf({
      logoSrc,
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
