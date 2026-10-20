import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { labourCost } from '@/lib/labour-cost'
import { buildReportTable, toCsv, REPORT_TYPES, type ReportType } from '@/lib/report-rows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * CSV export for the Reports page (PRD §17).
 *   GET /api/reports/csv?type=project|employee|entity|location|overtime|approved-overtime|hours-by-project
 *       &from=YYYY-MM-DD&to=YYYY-MM-DD[&entity=][&employee=][&project=]
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const type = (REPORT_TYPES.includes(sp.get('type') as ReportType) ? sp.get('type') : 'project') as ReportType
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'bad_range' }, { status: 400 })
  }

  const admin = createAdminClient()
  const cost = await labourCost(admin, {
    from, to,
    entityId: sp.get('entity') || undefined,
    employeeId: sp.get('employee') || undefined,
    projectId: sp.get('project') || undefined,
  })
  const table = await buildReportTable(admin, type, cost, from, to)

  return new NextResponse(toCsv(table.headers, table.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${table.filename}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
