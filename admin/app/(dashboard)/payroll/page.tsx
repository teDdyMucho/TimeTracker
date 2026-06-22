import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { updatePayrollStatusAction } from './actions'
import NewPayrollRunForm from './new-run-form'
import type { BusinessEntity } from '@/lib/types'

export default async function PayrollPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const [runsRes, entitiesRes] = await Promise.all([
    adminClient
      .from('payroll_runs')
      .select(
        'id, period_start, period_end, status, total_gross, total_employees, xero_sync_status, generated_at, business_entity_id',
      )
      .order('period_end', { ascending: false }),
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
  ])

  const runs = runsRes.data ?? []
  const entities = (entitiesRes.data ?? []) as BusinessEntity[]
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]))

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Fortnightly pay runs — Xero export via API"
        action={<NewPayrollRunForm entities={entities} />}
      />

      {/* Xero notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-6">
        <strong>Xero integration is pending.</strong> Pay runs can be created and reviewed here.
        Export to Xero will be available once the Edge Function is deployed.
      </div>

      {runs.length === 0 ? (
        <Card>
          <p className="text-muted text-sm py-8 text-center">
            No payroll runs yet. Use &ldquo;New pay run&rdquo; to create a draft.
          </p>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100">
                {[
                  'Entity',
                  'Period',
                  'Employees',
                  'Gross Pay',
                  'Status',
                  'Xero',
                  'Actions',
                ].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {runs.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium">
                    {entityMap[r.business_entity_id] ?? '—'}
                  </td>
                  <td className="py-3 pr-4 text-muted whitespace-nowrap">
                    {r.period_start} – {r.period_end}
                  </td>
                  <td className="py-3 pr-4 text-center">{r.total_employees}</td>
                  <td className="py-3 pr-4 font-semibold">
                    {Number(r.total_gross) > 0
                      ? `$${Number(r.total_gross).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                      : <span className="text-muted">Pending</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={r.status} />
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={r.xero_sync_status} />
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2 flex-wrap">
                      {r.status === 'draft' && (
                        <form action={updatePayrollStatusAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="finalised" />
                          <button
                            type="submit"
                            className="text-xs px-2.5 py-1 bg-brand/10 text-brand hover:bg-brand/20 rounded-lg font-medium transition-colors"
                          >
                            Finalise
                          </button>
                        </form>
                      )}
                      {r.status === 'finalised' && (
                        <form action={updatePayrollStatusAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="paid" />
                          <button
                            type="submit"
                            className="text-xs px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-medium transition-colors"
                          >
                            Mark paid
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
