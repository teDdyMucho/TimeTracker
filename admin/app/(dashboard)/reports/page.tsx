import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { Download } from 'lucide-react'
import ReportsFilter from './reports-filter'
import { formatHours } from '@/lib/format'
import { labourCost, money } from '@/lib/labour-cost'
import { PAY_BAND_LABELS, type PayBand } from '@/lib/payroll'

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
  searchParams: Promise<{ from?: string; to?: string; entity?: string; employee?: string; project?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const from = params.from ?? thirtyDaysAgo
  const to = params.to ?? today
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

  const csvHref = (type: string) => {
    const q = new URLSearchParams({ type, from, to })
    if (entityId) q.set('entity', entityId)
    if (employeeId) q.set('employee', employeeId)
    if (projectId) q.set('project', projectId)
    return `/api/reports/csv?${q}`
  }

  const loc = cost.byLocation
  const overtimeDays = cost.days.filter((d) => d.overtimeHours > 0 || d.overtimeStatus !== 'none')
  const otBands: PayBand[] = ['overtime_t1', 'overtime_t2', 'saturday', 'sunday', 'public_holiday']

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Labour hours and cost from approved attendance, costed the same way as payroll"
      />

      <ReportsFilter
        from={from}
        to={to}
        entity={entityId}
        employee={employeeId}
        project={projectId}
        entities={entities}
        employees={employees}
        projects={projects}
      />

      {cost.unratedEmployees.length > 0 && (
        <div className="rounded-2xl px-5 py-3.5 text-sm mb-6" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          <strong>No pay rate set for:</strong> {cost.unratedEmployees.join(', ')}. Their hours are counted but their cost shows as $0 — set rates in Employees.
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Hours"
          value={formatHours(cost.paidHours)}
          sub={cost.breakHours > 0 ? `${formatHours(cost.totalHours)} worked − ${formatHours(cost.breakHours)} unpaid breaks · ${cost.byEmployee.length} employees` : `${cost.byEmployee.length} employee${cost.byEmployee.length !== 1 ? 's' : ''}`}
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

      {/* ── Overtime report ────────────────────────────────────────────────── */}
      <Card>
        <SectionHead
          title="Overtime Report"
          sub="Each employee-day with overtime, weekend or public-holiday hours, its approval status and cost impact"
          href={csvHref('overtime')}
        />
        {overtimeDays.length === 0 ? (
          <p className="text-muted text-sm">No overtime in this period.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <Th>Employee</Th><Th>Date</Th><Th>Project</Th><Th right>Day hours</Th>
                {otBands.map((b) => <Th key={b} right>{PAY_BAND_LABELS[b]}</Th>)}
                <Th>Approval</Th><Th right>Cost impact</Th>
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
                  <td className="py-2.5 pr-4"><Badge status={d.overtimeStatus === 'none' ? 'none' : d.overtimeStatus} /></td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-ink">{d.overtimeCost > 0 ? money(d.overtimeCost) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-bold text-ink">
                <td className="pt-3" colSpan={3}>Total</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{formatHours(overtimeDays.reduce((s, d) => s + d.hours, 0))}</td>
                {otBands.map((b) => <td key={b} className="pt-3 pr-4 text-right tabular-nums">{formatHours(cost.byBand[b].hours)}</td>)}
                <td />
                <td className="pt-3 text-right tabular-nums">{money(cost.overtimeCost)}</td>
              </tr>
            </tbody>
          </table></div>
        )}
        <p className="text-xs text-muted mt-3">
          &ldquo;Approval&rdquo; is the worker&rsquo;s overtime request for that day. Cost impact is the loading above ordinary
          rates only when the entity is set to pay overtime from hours; with &ldquo;overtime needs approval&rdquo; on,
          unapproved weekday overtime is costed at the ordinary rate.
        </p>
      </Card>
    </div>
  )
}

function SectionHead({ title, sub, href }: { title: string; sub: string; href: string }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="text-xs text-muted mt-0.5">{sub}</p>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold border whitespace-nowrap hover:bg-stone transition-colors"
        style={{ borderColor: 'rgba(28,26,22,0.35)', color: '#000000' }}
      >
        <Download size={12} /> CSV
      </a>
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
