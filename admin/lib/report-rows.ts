/**
 * Row builders shared by the Reports CSV and Excel exports, so both formats
 * always carry the same columns. Every figure comes from the labour-cost
 * engine (`CostBreakdown`), so exports reconcile with the page and payroll.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CostBreakdown } from '@/lib/labour-cost'
import { PAY_BAND_LABELS, PAY_BANDS } from '@/lib/payroll'

export type ReportType = 'project' | 'employee' | 'entity' | 'location' | 'overtime' | 'approved-overtime' | 'hours-by-project'

export const REPORT_TYPES: ReportType[] = ['project', 'employee', 'entity', 'location', 'overtime', 'approved-overtime', 'hours-by-project']

export interface ReportTable {
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  filename: string
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function fmtMelbourne(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export async function buildReportTable(
  admin: SupabaseClient,
  type: ReportType,
  cost: CostBreakdown,
  from: string,
  to: string,
): Promise<ReportTable> {
  const filename = `${type === 'project' ? 'labour-project' : type === 'employee' ? 'labour-employee' : type === 'entity' ? 'labour-entity' : type === 'location' ? 'labour-location' : type}-${from}-to-${to}`
  switch (type) {
    case 'employee':
      return {
        title: 'Labour cost by employee', filename,
        headers: ['Employee', 'Hours worked', 'Unpaid breaks', 'OT awaiting approval (h)', 'Labour cost', 'Overtime hours', 'Overtime cost', 'Projects worked', 'Rate set'],
        rows: cost.byEmployee.map((e) => [e.name, e.hours, e.breakHours, e.pendingOvertimeHours, e.cost, e.overtimeHours, e.overtimeCost, e.projects.join('; '), e.hasRate ? 'yes' : 'no']),
      }
    case 'entity':
      return {
        title: 'Business entity report', filename,
        headers: ['Business entity', 'Hours worked', 'Unpaid breaks', 'OT awaiting approval (h)', 'Labour cost', 'Overtime hours', 'Overtime cost'],
        rows: cost.byEntity.map((e) => [e.name, e.hours, e.breakHours, e.pendingOvertimeHours, e.cost, e.overtimeHours, e.overtimeCost]),
      }
    case 'location':
      return {
        title: 'Site vs factory', filename,
        headers: ['Location', 'Hours', 'Labour cost'],
        rows: [
          ['On site', cost.byLocation.site.hours, cost.byLocation.site.cost],
          ['Factory / Workshop', cost.byLocation.workshop.hours, cost.byLocation.workshop.cost],
        ],
      }
    case 'overtime': {
      const { data: projects } = await admin.from('projects').select('id, name')
      const pname = new Map((projects ?? []).map((p: any) => [p.id, p.name as string]))
      return {
        title: 'Overtime report', filename,
        headers: ['Employee', 'Date', 'Projects', 'Hours worked', ...PAY_BANDS.map((b) => PAY_BAND_LABELS[b]), 'OT awaiting approval (h)', 'Overtime hours (paid)', 'Overtime cost', 'Approval status', 'Approver', 'Decided at'],
        rows: cost.days
          .filter((d) => d.overtimeHours > 0 || d.pendingOvertimeHours > 0 || d.overtimeStatus !== 'none')
          .map((d) => [
            d.name, d.date, d.projectIds.map((id) => pname.get(id) ?? id).join('; '), d.hours,
            ...PAY_BANDS.map((b) => d.bandHours[b]), d.pendingOvertimeHours, d.overtimeHours, d.overtimeCost, d.overtimeStatus,
            d.approverName ?? '', fmtMelbourne(d.decidedAt),
          ]),
      }
    }
    case 'approved-overtime': {
      // TV4: approved overtime per pay period, for Terry / Chanelle to run and export.
      const { data: projects } = await admin.from('projects').select('id, name, business_entity_id')
      const pname = new Map((projects ?? []).map((p: any) => [p.id, p.name as string]))
      const { data: entities } = await admin.from('business_entities').select('id, name')
      const ename = new Map((entities ?? []).map((e: any) => [e.id, e.name as string]))
      const rows = cost.days
        .filter((d) => d.overtimeStatus === 'approved' && (d.bandHours.overtime_t1 + d.bandHours.overtime_t2) > 0)
        .map((d) => [
          d.name, d.date, ename.get(d.entityId) ?? '', d.projectIds.map((id) => pname.get(id) ?? id).join('; '),
          d.hours, d.paidHours, r2(d.bandHours.overtime_t1 + d.bandHours.overtime_t2), d.bandHours.overtime_t1, d.bandHours.overtime_t2,
          d.approverName ?? '', fmtMelbourne(d.decidedAt),
        ])
      return {
        title: 'Approved overtime', filename,
        headers: ['Employee', 'Date', 'Company', 'Projects', 'Hours worked', 'Hours paid', 'Approved overtime (h)', 'Tier 1 (h)', 'Tier 2 (h)', 'Approved by', 'Approved at'],
        rows,
      }
    }
    case 'hours-by-project':
      // TV7: per pay period — project, employee, company, regular, overtime, total. No dollar figures.
      return {
        title: 'Hours by project', filename,
        headers: ['Project', 'Employee', 'Company', 'Regular hours', 'Overtime hours', 'OT awaiting approval (h)', 'Unpaid break (h)', 'Total hours (paid)', 'Hours worked'],
        rows: cost.byProjectEmployee.map((p) => [
          p.projectName, p.employeeName, p.entityName, p.regularHours, p.overtimeHours, p.pendingOvertimeHours, p.breakHours, p.paidHours, p.workedHours,
        ]),
      }
    default: {
      const { data: fin } = await admin.from('project_financials').select('project_id, budget_labour_cost')
      const { data: projects } = await admin.from('projects').select('id, budget_hours, client, code')
      const budget = new Map((fin ?? []).map((f: any) => [f.project_id, f.budget_labour_cost == null ? null : Number(f.budget_labour_cost)]))
      const meta = new Map((projects ?? []).map((p: any) => [p.id, p]))
      return {
        title: 'Labour cost by project', filename,
        headers: ['Project', 'Client', 'Code', 'Entity', 'Hours', 'Budget hours', 'Labour cost', 'Overtime hours', 'Overtime cost', 'OT awaiting approval (h)', 'Budget labour cost', 'Variance'],
        rows: cost.byProject.map((p) => {
          const b = budget.get(p.id) ?? null
          const m = meta.get(p.id)
          return [
            p.name, m?.client ?? '', m?.code ?? '', cost.byEntity.find((e) => e.id === p.entityId)?.name ?? '',
            p.hours, m?.budget_hours ?? '', p.cost, p.overtimeHours, p.overtimeCost, p.pendingOvertimeHours, b ?? '', b == null ? '' : r2(b - p.cost),
          ]
        }),
      }
    }
  }
}

/** CSV text with a BOM so Excel opens it as UTF-8; formula-looking text cells are neutralised. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
}

/** An .xlsx workbook (one sheet) with a bold header row and auto-sized columns. */
export async function toXlsx(sheetName: string, headers: string[], rows: (string | number | null | undefined)[][], subtitle?: string): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Timevera'
  const ws = wb.addWorksheet(sheetName.slice(0, 31))
  let headerRow = 1
  if (subtitle) {
    ws.getCell(1, 1).value = subtitle
    ws.getCell(1, 1).font = { bold: true, size: 12 }
    headerRow = 3
  }
  const h = ws.getRow(headerRow)
  headers.forEach((t, i) => { h.getCell(i + 1).value = t })
  h.font = { bold: true }
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } }
  rows.forEach((r, ri) => {
    const row = ws.getRow(headerRow + 1 + ri)
    r.forEach((v, ci) => {
      // Text that looks like a formula is stored as text, never evaluated.
      row.getCell(ci + 1).value = typeof v === 'string' && /^[=+\-@]/.test(v) ? { richText: [{ text: v }] } : (v ?? '')
    })
  })
  headers.forEach((t, i) => {
    const width = Math.max(t.length, ...rows.map((r) => String(r[i] ?? '').length))
    ws.getColumn(i + 1).width = Math.min(Math.max(width + 2, 10), 50)
  })
  ws.views = [{ state: 'frozen', ySplit: headerRow }]
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
