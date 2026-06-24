import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import ReportsFilter from './reports-filter'
import { formatHours } from '@/lib/format'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; entity?: string; employee?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const from = params.from ?? thirtyDaysAgo
  const to = params.to ?? today

  const [entitiesRes, employeesRes, timesheetsRes, payRatesRes] = await Promise.all([
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
    adminClient.from('profiles').select('id, name').neq('role', 'admin').eq('status', 'active').order('name'),
    supabase
      .from('timesheets')
      .select(
        'id, profile_id, work_date, hours, work_location, business_entity_id, project_id, projects!inner(name)',
      )
      .gte('work_date', from)
      .lte('work_date', to)
      .in('status', ['submitted', 'approved', 'locked'])
      .then((res) => {
        let data = res.data ?? []
        if (params.entity) data = data.filter((t: any) => t.business_entity_id === params.entity)
        if (params.employee) data = data.filter((t: any) => t.profile_id === params.employee)
        return { ...res, data }
      }),
    adminClient
      .from('pay_rates')
      .select('profile_id, hourly_rate, effective_from, effective_to')
      .lte('effective_from', to),
  ])

  const entities = entitiesRes.data ?? []
  const employees = employeesRes.data ?? []
  const timesheets = timesheetsRes.data ?? []
  const payRates = payRatesRes.data ?? []

  // Hours by project
  const byProject = new Map<string, { name: string; hours: number }>()
  for (const t of timesheets as any[]) {
    const key = t.project_id
    const cur = byProject.get(key) ?? { name: t.projects?.name ?? key, hours: 0 }
    byProject.set(key, { ...cur, hours: round2(cur.hours + Number(t.hours)) })
  }
  const projectRows = Array.from(byProject.values()).sort((a, b) => b.hours - a.hours)

  // Hours by location
  const locationHours = { site: 0, workshop: 0 }
  for (const t of timesheets as any[]) {
    if (t.work_location === 'site') locationHours.site = round2(locationHours.site + Number(t.hours))
    else locationHours.workshop = round2(locationHours.workshop + Number(t.hours))
  }
  const totalHours = round2(locationHours.site + locationHours.workshop)

  // Hours by employee
  const byEmployee = new Map<string, { hours: number }>()
  for (const t of timesheets as any[]) {
    const key = t.profile_id
    const cur = byEmployee.get(key) ?? { hours: 0 }
    byEmployee.set(key, { hours: round2(cur.hours + Number(t.hours)) })
  }

  // Labour cost estimate (sum of hours × current rate for each employee)
  const rateMap = new Map<string, number>()
  for (const r of payRates as any[]) {
    if (!r.effective_to || r.effective_to >= from) {
      rateMap.set(r.profile_id, Number(r.hourly_rate))
    }
  }
  let estimatedCost: number | null = payRates.length > 0 ? 0 : null
  if (estimatedCost !== null) {
    Array.from(byEmployee.entries()).forEach(([profileId, { hours }]) => {
      const rate = rateMap.get(profileId)
      if (rate !== undefined && estimatedCost !== null) {
        estimatedCost = round2(estimatedCost + hours * rate)
      }
    })
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Labour hours summary — exact costs are computed during payroll runs"
      />

      <ReportsFilter
        from={from}
        to={to}
        entity={params.entity ?? ''}
        employee={params.employee ?? ''}
        entities={entities as any}
        employees={employees as any}
      />

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Total Hours" value={formatHours(totalHours)} />
        <SummaryCard label="On-site Hours" value={formatHours(locationHours.site)} sub={pct(locationHours.site, totalHours)} />
        <SummaryCard label="Workshop Hours" value={formatHours(locationHours.workshop)} sub={pct(locationHours.workshop, totalHours)} />
        <SummaryCard
          label="Est. Labour Cost"
          value={
            estimatedCost !== null
              ? `$${estimatedCost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
              : 'Rates not set'
          }
          sub="Straight-time only — run payroll for full OT breakdown"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* By project */}
        <Card>
          <h2 className="font-semibold text-ink mb-4">Hours by Project</h2>
          {projectRows.length === 0 ? (
            <p className="text-muted text-sm">No timesheet data for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 font-medium text-muted">Project</th>
                  <th className="pb-2 font-medium text-muted text-right">Hours</th>
                  <th className="pb-2 font-medium text-muted text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {projectRows.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                    <td className="py-2.5 text-right font-semibold">{formatHours(p.hours)}</td>
                    <td className="py-2.5 text-right text-muted">{pct(p.hours, totalHours)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200">
                  <td className="pt-3 font-bold text-ink">Total</td>
                  <td className="pt-3 text-right font-bold">{formatHours(totalHours)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        {/* By location */}
        <Card>
          <h2 className="font-semibold text-ink mb-4">On-site vs Workshop</h2>
          {totalHours === 0 ? (
            <p className="text-muted text-sm">No data yet.</p>
          ) : (
            <>
              <div className="flex rounded-full overflow-hidden h-6 mb-4 bg-slate-100">
                {locationHours.site > 0 && (
                  <div
                    className="bg-brand h-full transition-all"
                    style={{ width: `${(locationHours.site / totalHours) * 100}%` }}
                  />
                )}
                {locationHours.workshop > 0 && (
                  <div
                    className="bg-slate-400 h-full transition-all"
                    style={{ width: `${(locationHours.workshop / totalHours) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-brand inline-block" />
                  <span className="text-ink font-medium">On-site</span>
                  <span className="text-muted">{formatHours(locationHours.site)} &middot; {pct(locationHours.site, totalHours)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />
                  <span className="text-ink font-medium">Workshop</span>
                  <span className="text-muted">{formatHours(locationHours.workshop)} &middot; {pct(locationHours.workshop, totalHours)}</span>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
