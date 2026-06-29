import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/server'
import { PayrollPdf, type PdfSection, type PdfEntry } from '@/lib/payroll-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Payroll PDF export. Scope is driven by query params:
 *   ?run=<id>                 → one pay run (one entity, its employees)
 *   ?entity=<id>              → all runs for one entity
 *   ?employee=<profileId>     → one employee across all entities
 *   ?entity=&employee=        → (both) that employee within that entity
 *   (none)                    → all employees, all entities
 */
export async function GET(req: NextRequest) {
  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const runId = sp.get('run')
  const entityId = sp.get('entity')
  const employeeId = sp.get('employee')

  // Pull runs (optionally narrowed) with their entries + names.
  let q = admin
    .from('payroll_runs')
    .select(
      'id, period_start, period_end, business_entity_id, business_entities(name), payroll_entries(profile_id, band_hours, gross_pay, profiles(name, email))',
    )
    .order('period_end', { ascending: false })

  if (runId) q = q.eq('id', runId)
  if (entityId) q = q.eq('business_entity_id', entityId)

  const { data: runs, error } = await q
  if (error) return new Response(error.message, { status: 500 })

  const runRows = (runs ?? []) as any[]

  // Flatten into entries, applying the employee filter if present.
  type Flat = PdfEntry & { entityId: string; periodStart: string; periodEnd: string }
  const flat: Flat[] = []
  for (const r of runRows) {
    const entityName = r.business_entities?.name ?? '—'
    for (const e of r.payroll_entries ?? []) {
      if (employeeId && e.profile_id !== employeeId) continue
      flat.push({
        name: e.profiles?.name ?? 'Unknown',
        email: e.profiles?.email ?? '',
        entityName,
        bandHours: e.band_hours ?? {},
        gross: Number(e.gross_pay || 0),
        entityId: r.business_entity_id,
        periodStart: r.period_start,
        periodEnd: r.period_end,
      })
    }
  }

  // Decide grouping + headings based on the scope.
  let heading = 'Payroll Summary'
  let meta = ''
  let sections: PdfSection[] = []
  let showEntityColumn = false

  const periodLabel = (() => {
    if (flat.length === 0) return ''
    const starts = flat.map((f) => f.periodStart).sort()
    const ends = flat.map((f) => f.periodEnd).sort()
    return `${fmtDate(starts[0])} – ${fmtDate(ends[ends.length - 1])}`
  })()

  if (employeeId && !entityId && !runId) {
    // One employee across all entities → group by entity
    const name = flat[0]?.name ?? 'Employee'
    heading = 'Employee Payslip'
    meta = `${name} · ${periodLabel}`
    showEntityColumn = true
    const byEntity = new Map<string, Flat[]>()
    for (const f of flat) byEntity.set(f.entityName, [...(byEntity.get(f.entityName) ?? []), f])
    sections = Array.from(byEntity.entries()).map(([title, entries]) => ({ title, entries }))
  } else if (runId || entityId) {
    // One entity (single run or all its runs) → single section
    const entityName = flat[0]?.entityName ?? runRows[0]?.business_entities?.name ?? 'Entity'
    heading = 'Payroll Summary'
    meta = `${entityName} · ${periodLabel}`
    sections = [{ title: entityName, entries: flat }]
  } else {
    // All employees, all entities → group by entity, with entity column
    heading = 'Company Payroll Summary'
    meta = `All entities · ${periodLabel}`
    showEntityColumn = false // entity is the section header
    const byEntity = new Map<string, Flat[]>()
    for (const f of flat) byEntity.set(f.entityName, [...(byEntity.get(f.entityName) ?? []), f])
    sections = Array.from(byEntity.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, entries]) => ({ title, entries }))
  }

  if (flat.length === 0) {
    sections = [{ title: 'No data', entries: [] }]
    meta = meta || 'No payroll entries match this filter'
  }

  // Load the logo as a data URI (react-pdf needs a source it can read in Node).
  let logoSrc = ''
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'buildone.png'))
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    logoSrc = ''
  }

  const generatedAt = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const buffer = await renderToBuffer(
    PayrollPdf({ logoSrc, heading, meta, generatedAt, sections, showEntityColumn }),
  )

  const fileName =
    `buildone-payroll-${(sections[0]?.title ?? 'all').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`

  return new Response(buffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
