import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { Download } from 'lucide-react'
import ReportsFilter from './reports-filter'
import { formatHours } from '@/lib/format'
import { labourCost, money } from '@/lib/labour-cost'
import { PAY_BAND_LABELS, type PayBand } from '@/lib/payroll'
import { normalizePayCycle, periodContaining } from '@/lib/pay-cycle'
import { fmtMelbourne } from '@/lib/report-rows'

export const dynamic = 'force-dynamic'

/**
 * Reports (PRD §17): labour cost by project (with budget variance), by
 * employee, site vs factory, by business entity, and the overtime report.
 * Every figure comes from the labour-cost engine, so totals reconcile with
 * payroll. Each table has a CSV export.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; entity?: string; employee?: string; project?: string; period?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  // Pay periods (TV4 / TV7: "per pay period") from Settings → Pay cycle: the
  // current one and the previous eleven. ?period=START_END sets the range.
  const { data: cycleRow } = await adminClient.from('settings').select('value').eq('key', 'pay_cycle').maybeSingle()
  const cycle = normalizePayCycle(cycleRow?.value)
  const periods: { start: string; end: string; label: string }[] = []
  {
    let p = periodContaining(cycle, today)
    for (let i = 0; i < 12; i++) {
      periods.push({ start: p.start, end: p.end, label: `${p.start} → ${p.end}${i === 0 ? ' (current)' : ''}` })
      const prevEnd = new Date(p.start + 'T00:00:00Z'); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
      p = periodContaining(cycle, prevEnd.toISOString().slice(0, 10))
    }
  }
  const chosen = params.period && /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(params.period) ? params.period.split('_') : null
  const lastCompleted = periods[1] ?? periods[0]
  const from = chosen ? chosen[0] : params.from ?? lastCompleted.start
  const to = chosen ? chosen[1] : params.to ?? lastCompleted.end
  const periodValue = periods.find((p) => p.start === from && p.end === to) ? `${from}_${to}` : ''
  const entityId = params.entity ?? ''
  const employeeId = params.employee ?? ''
  const projectId = params.project ?? ''

  const [entitiesRes, employeesRes, projectsRes, finRes, cost, alertRes] = await Promise.all([
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
    adminClient.from('profiles').select('id, name').neq('role', 'admin').eq('status', 'active').order('name'),
    adminClient.from('projects').select('id, name, business_entity_id, budget_hours, client').order('name'),
    adminClient.from('project_financials').select('project_id, budget_labour_cost'),
    labourCost(adminClient, {
      from, to,
      entityId: entityId || undefined,
      employeeId: employeeId || undefined,
      projectId: projectId || undefined,
    }),
    adminClient.from('settings').select('value').eq('key', 'labour_cost_alert').maybeSingle(),
  ])

  const defaultBudgetRaw = (alertRes.data?.value as any)?.defaultBudget
  const defaultBudget = typeof defaultBudgetRaw === 'number' && defaultBudgetRaw > 0 ? defaultBudgetRaw : null
  const entities = (entitiesRes.data ?? []) as { id: string; name: string }[]
  const employees = (employeesRes.data ?? []) as { id: string; name: string }[]
  const projects = (projectsRes.data ?? []) as { id: string; name: string; business_entity_id: string; budget_hours: number | null; client: string | null }[]
  const projectMeta = new Map(projects.map((p) => [p.id, p]))
  const budgetCost = new Map((finRes.data ?? []).map((f: any) => [f.project_id, f.budget_labour_cost == null ? null : Number(f.budget_labour_cost)]))
  const entityName = new Map(entities.map((e) => [e.id, e.name]))

  // Same-named projects in two businesses get the business appended.
  const nameCount = new Map<string, number>()
  for (const p of cost.byProject) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1)
  const projectLabel = (p: { name: string; entityId: string }) =>
    (nameCount.get(p.name) ?? 0) > 1 ? `${p.name} (${entityName.get(p.entityId) ?? 'unknown'})` : p.name

  const exportQuery = (type: string) => {
    const q = new URLSearchParams({ type, from, to })
    if (entityId) q.set('entity', entityId)
    if (employeeId) q.set('employee', employeeId)
    if (projectId) q.set('project', projectId)
    return q.toString()
  }
  const csvHref = (type: string) => `/api/reports/csv?${exportQuery(type)}`
  const xlsxHref = (type: string) => `/api/reports/xlsx?${exportQuery(type)}`
  // TV5: one report per company — tabs keep every other filter.
  const tabHref = (entity: string) => {
    const q = new URLSearchParams({ from, to })
    if (entity) q.set('entity', entity)
    if (employeeId) q.set('employee', employeeId)
    return `/reports?${q}`
  }

  const loc = cost.byLocation
  const overtimeDays = cost.days.filter((d) => d.overtimeHours > 0 || d.pendingOvertimeHours > 0 || d.overtimeStatus !== 'none')
  const approvedOt = cost.days.filter((d) => d.overtimeStatus === 'approved' && d.bandHours.overtime_t1 + d.bandHours.overtime_t2 > 0)
  const approvedOtHours = approvedOt.reduce((s, d) => s + d.bandHours.overtime_t1 + d.bandHours.overtime_t2, 0)
  const pendingDays = cost.days.filter((d) => d.pendingOvertimeHours > 0)
  const otBands: PayBand[] = ['overtime_t1', 'overtime_t2', 'saturday', 'sunday', 'public_holiday']

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Labour hours and cost from approved attendance, costed the same way as payroll"
      />

      {/* TV5: separate company reports */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: '', name: 'All companies' }, ...entities].map((e) => {
          const on = (entityId || '') === e.id
          return (
            <a
              key={e.id || 'all'}
              href={tabHref(e.id)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
              style={on ? { background: '#1C1A16', color: '#fff', borderColor: '#1C1A16' } : { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }}
            >
              {e.name}
            </a>
          )
        })}
      </div>

      <ReportsFilter
        from={from}
        to={to}
        entity={entityId}
        employee={employeeId}
        project={projectId}
        entities={entities}
        employees={employees}
        projects={projects}
        periods={periods}
        period={periodValue}
      />

      {cost.unratedEmployees.length > 0 && (
        <div className="rounded-2xl px-5 py-3.5 text-sm mb-6" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          <strong>No pay rate set for:</strong> {cost.unratedEmployees.join(', ')}. Their hours are counted but their cost shows as $0 — set rates in Employees.
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Hours paid"
          value={formatHours(cost.paidHours)}
          sub={`${formatHours(cost.totalHours)} worked − ${formatHours(cost.breakHours)} unpaid breaks${cost.pendingOvertimeHours > 0 ? ` − ${formatHours(cost.pendingOvertimeHours)} OT awaiting approval` : ''} · ${cost.byEmployee.length} employee${cost.byEmployee.length !== 1 ? 's' : ''}`}
        />
        <SummaryCard label="Labour Cost" value={money(cost.totalCost)} sub={`Ordinary ${money(cost.ordinaryCost)}`} />
        <SummaryCard label="Overtime & Penalty Cost" value={money(cost.overtimeCost)} sub={`${formatHours(cost.overtimeHours)} on loaded rates`} />
        <SummaryCard label="Site / Workshop" value={`${pct(loc.site.hours, cost.totalHours)} / ${pct(loc.workshop.hours, cost.totalHours)}`} sub={`${money(loc.site.cost)} / ${money(loc.workshop.cost)}`} />
      </div>

      {/* ── Labour cost by project ─────────────────────────────────────────── */}
      <Card className="mb-6">
        <SectionHead title="Labour Cost by Project" sub="Hours, loaded cost, overtime share and variance against the project budget" href={csvHref('project')} />
        {cost.byProject.length === 0 ? (
          <p className="text-muted text-sm">No approved hours for this period.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <Th>Project</Th><Th right>Hours</Th><Th right>Budget hrs</Th><Th right>Overtime</Th><Th right>OT cost</Th><Th right>Labour cost</Th><Th right>Budget</Th><Th right>Variance</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cost.byProject.map((p) => {
                const meta = projectMeta.get(p.id)
                const budget = budgetCost.get(p.id) ?? defaultBudget
                const variance = budget == null ? null : Math.round((budget - p.cost) * 100) / 100
                return (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-ink">{projectLabel(p)}</div>
                      {meta?.client && <div className="text-xs text-muted">{meta.client}</div>}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">{formatHours(p.hours)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{meta?.budget_hours != null ? formatHours(meta.budget_hours) : '—'}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{p.overtimeHours > 0 ? formatHours(p.overtimeHours) : '—'}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{p.overtimeCost > 0 ? money(p.overtimeCost) : '—'}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-bold text-ink">{money(p.cost)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{budget != null ? money(budget) : '—'}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold" style={{ color: variance == null ? '#A1A1AA' : variance < 0 ? '#DC2626' : '#15803D' }}>
                      {variance == null ? 'no budget' : `${variance < 0 ? '−' : '+'}${money(Math.abs(variance))}`}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t border-slate-200 font-bold text-ink">
                <td className="pt-3">Total</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(cost.totalHours)}</td>
                <td />
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(cost.overtimeHours)}</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{money(cost.overtimeCost)}</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{money(cost.totalCost)}</td>
                <td /><td />
              </tr>
            </tbody>
          </table></div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* ── Labour cost by employee ─────────────────────────────────────── */}
        <Card>
          <SectionHead title="Labour Cost by Employee" sub="Hours, cost, overtime and projects worked" href={csvHref('employee')} />
          {cost.byEmployee.length === 0 ? (
            <p className="text-muted text-sm">No data for this period.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <Th>Employee</Th><Th right>Hours</Th><Th right>Overtime</Th><Th right>Cost</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cost.byEmployee.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-ink">{e.name}{!e.hasRate && <span className="ml-2 text-[10px] font-semibold uppercase text-amber-600">no rate</span>}</div>
                      <div className="text-xs text-muted truncate max-w-[260px]">{e.projects.join(' · ') || '—'}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">{formatHours(e.hours)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{e.overtimeHours > 0 ? `${formatHours(e.overtimeHours)} · ${money(e.overtimeCost)}` : '—'}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-ink">{money(e.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>

        {/* ── Business entity + site vs factory ───────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <SectionHead title="Business Entity Report" sub="Build One, ARKO Joinery and any future division" href={csvHref('entity')} />
            {cost.byEntity.length === 0 ? (
              <p className="text-muted text-sm">No data for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <Th>Business</Th><Th right>Hours</Th><Th right>OT cost</Th><Th right>Labour cost</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cost.byEntity.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2.5 pr-4 font-medium text-ink">{e.name}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">{formatHours(e.hours)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{e.overtimeCost > 0 ? money(e.overtimeCost) : '—'}</td>
                      <td className="py-2.5 text-right tabular-nums font-bold text-ink">{money(e.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <SectionHead title="Site vs Factory" sub="Hours and cost by work location" href={csvHref('location')} />
            {cost.totalHours === 0 ? (
              <p className="text-muted text-sm">No data yet.</p>
            ) : (
              <>
                <div className="flex rounded-full overflow-hidden h-6 mb-4 bg-slate-100">
                  {loc.site.hours > 0 && <div className="bg-brand h-full" style={{ width: `${(loc.site.hours / cost.totalHours) * 100}%` }} />}
                  {loc.workshop.hours > 0 && <div className="bg-slate-400 h-full" style={{ width: `${(loc.workshop.hours / cost.totalHours) * 100}%` }} />}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-100"><Th>Location</Th><Th right>Hours</Th><Th right>Share</Th><Th right>Cost</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-ink"><span className="w-2.5 h-2.5 rounded-full bg-brand inline-block mr-2" />On site</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">{formatHours(loc.site.hours)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{pct(loc.site.hours, cost.totalHours)}</td>
                      <td className="py-2.5 text-right tabular-nums font-bold text-ink">{money(loc.site.cost)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-ink"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block mr-2" />Factory / Workshop</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">{formatHours(loc.workshop.hours)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{pct(loc.workshop.hours, cost.totalHours)}</td>
                      <td className="py-2.5 text-right tabular-nums font-bold text-ink">{money(loc.workshop.cost)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ── TV7: Hours by project (no dollar figures) ───────────────────────── */}
      <Card className="mb-6">
        <SectionHead
          title="Hours by Project"
          sub="Per pay period: project, employee, company, regular hours, overtime hours, total. Hours count against the project worked on; wages go to the employee's employer."
          href={csvHref('hours-by-project')}
          xlsxHref={xlsxHref('hours-by-project')}
        />
        {cost.byProjectEmployee.length === 0 ? (
          <p className="text-muted text-sm">No approved hours for this period.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <Th>Project</Th><Th>Employee</Th><Th>Company</Th><Th right>Regular</Th><Th right>Overtime</Th><Th right>OT awaiting approval</Th><Th right>Total (paid)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cost.byProjectEmployee.map((p) => (
                <tr key={`${p.projectId}-${p.profileId}`}>
                  <td className="py-2.5 pr-4 font-medium text-ink">{p.projectName}</td>
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">{p.employeeName}</td>
                  <td className="py-2.5 pr-4 text-muted whitespace-nowrap">{p.entityName}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{formatHours(p.regularHours)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{p.overtimeHours > 0 ? formatHours(p.overtimeHours) : '—'}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-amber-700">{p.pendingOvertimeHours > 0 ? formatHours(p.pendingOvertimeHours) : '—'}</td>
                  <td className="py-2.5 text-right tabular-nums font-bold text-ink">{formatHours(p.paidHours)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-bold text-ink">
                <td className="pt-3" colSpan={3}>Total</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(cost.byProjectEmployee.reduce((s, p) => s + p.regularHours, 0))}</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(cost.byProjectEmployee.reduce((s, p) => s + p.overtimeHours, 0))}</td>
                <td className="pt-3 pr-4 text-right tabular-nums text-amber-700">{formatHours(cost.byProjectEmployee.reduce((s, p) => s + p.pendingOvertimeHours, 0))}</td>
                <td className="pt-3 text-right tabular-nums">{formatHours(cost.byProjectEmployee.reduce((s, p) => s + p.paidHours, 0))}</td>
              </tr>
            </tbody>
          </table></div>
        )}
      </Card>

      {/* ── TV4: Approved overtime per pay period ───────────────────────────── */}
      <Card className="mb-6">
        <SectionHead
          title="Approved Overtime"
          sub={`Approved weekday overtime in this period: ${formatHours(approvedOtHours)} over ${approvedOt.length} day${approvedOt.length === 1 ? '' : 's'}${pendingDays.length ? ` · ${pendingDays.length} day${pendingDays.length === 1 ? '' : 's'} still awaiting approval (${formatHours(cost.pendingOvertimeHours)}, unpaid)` : ''}`}
          href={csvHref('approved-overtime')}
          xlsxHref={xlsxHref('approved-overtime')}
        />
        {approvedOt.length === 0 ? (
          <p className="text-muted text-sm">No approved overtime in this period.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <Th>Employee</Th><Th>Date</Th><Th>Company</Th><Th>Project</Th><Th right>Hours paid</Th><Th right>Approved OT</Th><Th>Approved by</Th><Th>When</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {approvedOt.map((d) => (
                <tr key={`${d.profileId}-${d.date}-${d.entityId}`}>
                  <td className="py-2.5 pr-4 font-medium text-ink whitespace-nowrap">{d.name}</td>
                  <td className="py-2.5 pr-4 text-muted whitespace-nowrap">{d.date}</td>
                  <td className="py-2.5 pr-4 text-muted whitespace-nowrap">{entityName.get(d.entityId) ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-muted max-w-[220px] truncate">{d.projectIds.map((id) => projectMeta.get(id)?.name ?? '—').join(', ')}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{formatHours(d.paidHours)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-ink">{formatHours(d.bandHours.overtime_t1 + d.bandHours.overtime_t2)}</td>
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">{d.approverName ?? '—'}</td>
                  <td className="py-2.5 text-muted whitespace-nowrap">{fmtMelbourne(d.decidedAt) || '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-bold text-ink">
                <td className="pt-3" colSpan={5}>Total</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(approvedOtHours)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table></div>
        )}
      </Card>

      {/* ── Overtime report ────────────────────────────────────────────────── */}
      <Card>
        <SectionHead
          title="Overtime Report"
          sub="Each employee-day with overtime, weekend or public-holiday hours, its approval status and cost impact"
          href={csvHref('overtime')}
          xlsxHref={xlsxHref('overtime')}
        />
        {overtimeDays.length === 0 ? (
          <p className="text-muted text-sm">No overtime in this period.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <Th>Employee</Th><Th>Date</Th><Th>Project</Th><Th right>Day hours</Th>
                {otBands.map((b) => <Th key={b} right>{PAY_BAND_LABELS[b]}</Th>)}
                <Th right>OT awaiting approval</Th><Th>Approval</Th><Th>Approver</Th><Th right>Cost impact</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {overtimeDays.map((d) => (
                <tr key={`${d.profileId}-${d.date}-${d.entityId}`}>
                  <td className="py-2.5 pr-4 font-medium text-ink whitespace-nowrap">{d.name}</td>
                  <td className="py-2.5 pr-4 text-muted whitespace-nowrap">{d.date}</td>
                  <td className="py-2.5 pr-4 text-muted max-w-[220px] truncate">{d.projectIds.map((id) => projectMeta.get(id)?.name ?? '—').join(', ')}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{formatHours(d.hours)}</td>
                  {otBands.map((b) => (
                    <td key={b} className="py-2.5 pr-4 text-right tabular-nums text-muted">{d.bandHours[b] > 0 ? formatHours(d.bandHours[b]) : '—'}</td>
                  ))}
                  <td className="py-2.5 pr-4 text-right tabular-nums text-amber-700">{d.pendingOvertimeHours > 0 ? formatHours(d.pendingOvertimeHours) : '—'}</td>
                  <td className="py-2.5 pr-4"><Badge status={d.overtimeStatus === 'none' ? 'none' : d.overtimeStatus} /></td>
                  <td className="py-2.5 pr-4 text-muted whitespace-nowrap">{d.approverName ?? '—'}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-ink">{d.overtimeCost > 0 ? money(d.overtimeCost) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-bold text-ink">
                <td className="pt-3" colSpan={3}>Total</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(overtimeDays.reduce((s, d) => s + d.hours, 0))}</td>
                {otBands.map((b) => <td key={b} className="pt-3 pr-4 text-right tabular-nums">{formatHours(cost.byBand[b].hours)}</td>)}
                <td className="pt-3 pr-4 text-right tabular-nums text-amber-700">{formatHours(cost.pendingOvertimeHours)}</td>
                <td /><td />
                <td className="pt-3 text-right tabular-nums">{money(cost.overtimeCost)}</td>
              </tr>
            </tbody>
          </table></div>
        )}
        <p className="text-xs text-muted mt-3">
          Weekday hours over 7.6 are overtime. They are paid at the overtime rates only once the approver has approved the
          worker&rsquo;s request; until then they are listed as awaiting approval and are not paid or costed. Saturday, Sunday
          and public-holiday hours are paid at their rate without a request.
        </p>
      </Card>
    </div>
  )
}

function SectionHead({ title, sub, href, xlsxHref }: { title: string; sub: string; href: string; xlsxHref?: string }) {
  const btn = 'inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold border whitespace-nowrap hover:bg-stone transition-colors'
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="text-xs text-muted mt-0.5">{sub}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        {xlsxHref && (
          <a href={xlsxHref} className={btn} style={{ borderColor: 'rgba(28,26,22,0.35)', color: '#000000' }}>
            <Download size={12} /> Excel
          </a>
        )}
        <a href={href} className={btn} style={{ borderColor: 'rgba(28,26,22,0.35)', color: '#000000' }}>
          <Download size={12} /> CSV
        </a>
      </div>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`pb-2 pr-4 font-medium text-muted text-[10px] uppercase tracking-widest whitespace-nowrap ${right ? 'text-right' : ''}`}>{children}</th>
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  )
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}
