import { createAdminClient } from '@/lib/server'
import { Card } from '@/components/ui'
import { formatHours } from '@/lib/format'
import { aggregateByProject, type PayConfig } from '@/lib/payroll'

interface Project { id: string; name: string; business_entity_id: string }

function money(n: number): string {
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Payroll totals per project over a date range (+ optional entity / project).
 * Computed live from approved/submitted timesheets — pay runs don't carry a
 * project, so we band each employee-day and apportion its cost across the
 * projects worked that day (see aggregateByProject).
 */
export default async function ProjectTotals({
  projects,
  entityId,
  projectId,
  from,
  to,
}: {
  projects: Project[]
  entityId: string
  projectId: string
  from: string
  to: string
}) {
  const admin = createAdminClient()
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]))

  // Timesheets in range that count for pay (submitted or approved).
  let tsQuery = admin
    .from('timesheets')
    .select('profile_id, project_id, business_entity_id, work_date, hours')
    .gte('work_date', from)
    .lte('work_date', to)
    .in('status', ['submitted', 'approved'])
  if (entityId) tsQuery = tsQuery.eq('business_entity_id', entityId)
  if (projectId) tsQuery = tsQuery.eq('project_id', projectId)

  const [tsRes, holRes, entRes, rateRes] = await Promise.all([
    tsQuery,
    admin.from('public_holidays').select('date').gte('date', from).lte('date', to),
    admin.from('business_entities').select('id, pay_config'),
    admin.from('pay_rates').select('profile_id, hourly_rate, effective_from').order('effective_from', { ascending: false }),
  ])

  const rows = (tsRes.data ?? []) as {
    profile_id: string; project_id: string; business_entity_id: string; work_date: string; hours: number
  }[]
  const holidays = new Set((holRes.data ?? []).map((h: any) => h.date as string))

  // Latest rate per employee.
  const rateMap: Record<string, number> = {}
  for (const r of (rateRes.data ?? []) as any[]) {
    if (!(r.profile_id in rateMap)) rateMap[r.profile_id] = Number(r.hourly_rate)
  }

  // The pay ladder differs per entity, so band each entity's rows with its own
  // config, then merge the per-project results.
  const configByEntity = Object.fromEntries(
    ((entRes.data ?? []) as any[]).map((e) => [e.id, e.pay_config as PayConfig]),
  )
  const rowsByEntity = new Map<string, typeof rows>()
  for (const r of rows) {
    const arr = rowsByEntity.get(r.business_entity_id) ?? []
    arr.push(r)
    rowsByEntity.set(r.business_entity_id, arr)
  }

  const merged = new Map<string, { projectId: string; hours: number; cost: number }>()
  for (const [eid, eRows] of rowsByEntity) {
    const cfg = configByEntity[eid]
    if (!cfg) continue
    const parts = aggregateByProject(eRows, holidays, cfg, (pid) => rateMap[pid] ?? 0)
    for (const p of parts) {
      const cur = merged.get(p.projectId) ?? { projectId: p.projectId, hours: 0, cost: 0 }
      cur.hours += p.hours
      cur.cost += p.cost
      merged.set(p.projectId, cur)
    }
  }

  const totals = [...merged.values()].sort((a, b) => b.cost - a.cost || b.hours - a.hours)
  const grandHours = totals.reduce((s, t) => s + t.hours, 0)
  const grandCost = totals.reduce((s, t) => s + t.cost, 0)

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-bold text-ink">Payroll per project</h2>
        <span className="text-xs text-muted">{fmtDate(from)} – {fmtDate(to)}</span>
      </div>
      <p className="text-xs text-muted mb-4">
        Labour cost per project from approved/submitted timesheets. Overtime &amp; weekend loading is
        apportioned to the projects worked each day.
      </p>

      {totals.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">
          No timesheet hours in this range for the selected scope.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                {['Project', 'Total Hours', 'Labour Cost'].map((h) => (
                  <th key={h} className={`pb-3 pr-4 font-medium text-muted whitespace-nowrap ${h !== 'Project' ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {totals.map((t) => (
                <tr key={t.projectId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium text-ink">{projectMap[t.projectId] ?? '—'}</td>
                  <td className="py-3 pr-4 text-right font-semibold tabular-nums">{formatHours(t.hours)}</td>
                  <td className="py-3 pr-4 text-right font-bold tabular-nums">
                    {t.cost > 0 ? money(t.cost) : <span className="text-muted font-normal">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold text-ink">
                <td className="py-3 pr-4">Total</td>
                <td className="py-3 pr-4 text-right tabular-nums">{formatHours(grandHours)}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{grandCost > 0 ? money(grandCost) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
