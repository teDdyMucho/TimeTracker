import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { labourCost } from '@/lib/labour-cost'
import { buildReportTable, toXlsx, REPORT_TYPES, type ReportType } from '@/lib/report-rows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Excel export for the Reports page — same rows as the CSV (TV4 / TV7 / TV10).
 *   GET /api/reports/xlsx?type=…&from=&to=[&entity=][&employee=][&project=]
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
  const entityId = sp.get('entity') || undefined
  const cost = await labourCost(admin, {
    from, to,
    entityId,
    employeeId: sp.get('employee') || undefined,
    projectId: sp.get('project') || undefined,
  })
  const table = await buildReportTable(admin, type, cost, from, to)
  let company = 'All companies'
  if (entityId) {
    const { data: e } = await admin.from('business_entities').select('name').eq('id', entityId).maybeSingle()
    company = e?.name ?? company
  }
  const buf = await toXlsx(table.title, table.headers, table.rows, `${table.title} · ${company} · ${from} to ${to}`)

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${table.filename}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
