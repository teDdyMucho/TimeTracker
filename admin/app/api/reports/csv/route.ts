import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { labourCost } from '@/lib/labour-cost'
import { PAY_BAND_LABELS, PAY_BANDS } from '@/lib/payroll'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReportType = 'project' | 'employee' | 'entity' | 'location' | 'overtime'

function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    // A text cell starting with = + - @ would run as a formula in Excel /
    // Sheets (names and emails are user-entered). Numbers are left alone.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM so Excel opens it as UTF-8.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

/**
 * CSV export for the Reports page (PRD §17).
 *   GET /api/reports/csv?type=project|employee|entity|location|overtime
 *       &from=YYYY-MM-DD&to=YYYY-MM-DD[&entity=][&employee=][&project=]
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const type = (sp.get('type') ?? 'project') as ReportType
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

  let rows: (string | number | null)[][]
  switch (type) {
    case 'employee':
      rows = [
        ['Employee', 'Hours', 'Labour cost', 'Overtime hours', 'Overtime cost', 'Projects worked', 'Rate set'],
        ...cost.byEmployee.map((e) => [e.name, e.hours, e.cost, e.overtimeHours, e.overtimeCost, e.projects.join('; '), e.hasRate ? 'yes' : 'no']),
      ]
      break
    case 'entity':
      rows = [
        ['Business entity', 'Hours', 'Labour cost', 'Overtime hours', 'Overtime cost'],
        ...cost.byEntity.map((e) => [e.name, e.hours, e.cost, e.overtimeHours, e.overtimeCost]),
      ]
      break
    case 'location':
      rows = [
        ['Location', 'Hours', 'Labour cost'],
        ['On site', cost.byLocation.site.hours, cost.byLocation.site.cost],
        ['Factory / Workshop', cost.byLocation.workshop.hours, cost.byLocation.workshop.cost],
      ]
      break
    case 'overtime': {
      const { data: projects } = await admin.from('projects').select('id, name')
      const pname = new Map((projects ?? []).map((p: any) => [p.id, p.name as string]))
      rows = [
        ['Employee', 'Date', 'Projects', 'Hours', ...PAY_BANDS.map((b) => PAY_BAND_LABELS[b]), 'Overtime hours', 'Overtime cost', 'Approval status'],
        ...cost.days
          .filter((d) => d.overtimeHours > 0 || d.overtimeStatus !== 'none')
          .map((d) => [
            d.name, d.date, d.projectIds.map((id) => pname.get(id) ?? id).join('; '), d.hours,
            ...PAY_BANDS.map((b) => d.bandHours[b]), d.overtimeHours, d.overtimeCost, d.overtimeStatus,
          ]),
      ]
      break
    }
    default: {
      const { data: fin } = await admin.from('project_financials').select('project_id, budget_labour_cost')
      const { data: projects } = await admin.from('projects').select('id, budget_hours, client, code')
      const budget = new Map((fin ?? []).map((f: any) => [f.project_id, f.budget_labour_cost == null ? null : Number(f.budget_labour_cost)]))
      const meta = new Map((projects ?? []).map((p: any) => [p.id, p]))
      rows = [
        ['Project', 'Client', 'Code', 'Entity', 'Hours', 'Budget hours', 'Labour cost', 'Overtime hours', 'Overtime cost', 'Budget labour cost', 'Variance'],
        ...cost.byProject.map((p) => {
          const b = budget.get(p.id) ?? null
          const m = meta.get(p.id)
          return [
            p.name, m?.client ?? '', m?.code ?? '', cost.byEntity.find((e) => e.id === p.entityId)?.name ?? '',
            p.hours, m?.budget_hours ?? '', p.cost, p.overtimeHours, p.overtimeCost, b ?? '', b == null ? '' : Math.round((b - p.cost) * 100) / 100,
          ]
        }),
      ]
    }
  }

  const filename = `labour-${type}-${from}-to-${to}.csv`
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
