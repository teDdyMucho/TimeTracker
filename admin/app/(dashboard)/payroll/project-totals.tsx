import { createAdminClient } from '@/lib/server'
import { Card } from '@/components/ui'
import { formatHours } from '@/lib/format'
import { labourCost } from '@/lib/labour-cost'

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

  // Same engine as payroll / reports: approved hours of active staff, banded
  // per employee-day with the entity's ladder (and its overtime-approval rule),
  // cost apportioned across the projects worked that day.
  const cost = await labourCost(admin, {
    from, to,
    entityId: entityId || undefined,
    projectId: projectId || undefined,
  })
  const totals = cost.byProject.map((p) => ({ projectId: p.id, hours: p.hours, cost: p.cost }))
  const grandHours = totals.reduce((s, t) => s + t.hours, 0)
  const grandCost = totals.reduce((s, t) => s + t.cost, 0)

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-bold text-ink">Payroll per project</h2>
        <span className="text-xs text-muted">{fmtDate(from)} – {fmtDate(to)}</span>
      </div>
      <p className="text-xs text-muted mb-4">
        Labour cost per project from approved timesheets. Overtime &amp; weekend loading is
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
