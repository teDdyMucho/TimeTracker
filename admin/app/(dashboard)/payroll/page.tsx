import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { updatePayrollStatusAction, deletePayrollRunAction } from './actions'
import NewPayrollRunForm from './new-run-form'
import { formatHours } from '@/lib/format'
import { ExternalLink } from 'lucide-react'
import type { BusinessEntity } from '@/lib/types'

export const dynamic = 'force-dynamic'

function bandTotal(band_hours: Record<string, number> | null): number {
  if (!band_hours) return 0
  return Object.values(band_hours).reduce((s, v) => s + Number(v || 0), 0)
}

export default async function PayrollPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const [runsRes, entitiesRes] = await Promise.all([
    adminClient
      .from('payroll_runs')
      .select(
        'id, period_start, period_end, status, xero_sync_status, created_at, business_entity_id, payroll_entries(profile_id, band_hours)',
      )
      .order('period_end', { ascending: false }),
    supabase
      .from('business_entities')
      .select('id, name, xero_tenant_id')
      .eq('status', 'active')
      .order('name'),
  ])

  const runs = (runsRes.data ?? []) as any[]
  const entities = (entitiesRes.data ?? []) as (BusinessEntity & { xero_tenant_id: string | null })[]
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e]))
  const anyConnected = entities.some((e) => e.xero_tenant_id)

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Fortnightly pay runs — hours export to Xero"
        action={<NewPayrollRunForm entities={entities} />}
      />

      {/* Xero status notice */}
      {anyConnected ? (
        <div className="rounded-2xl px-5 py-3.5 text-sm mb-6" style={{ background: 'rgba(154,122,78,0.10)', border: '1px solid rgba(154,122,78,0.22)', color: '#836439' }}>
          <strong>Xero is connected.</strong> Create a pay run to aggregate each employee&rsquo;s hours
          into pay bands, then use <em>Preview export</em> to review exactly what will be sent to Xero.
        </div>
      ) : (
        <div className="rounded-2xl px-5 py-3.5 text-sm mb-6" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          <strong>No entity connected to Xero yet.</strong> Connect an entity in <em>Entities → Connect Xero</em> to enable payroll export.
        </div>
      )}

      {runs.length === 0 ? (
        <Card>
          <p className="text-muted text-sm py-8 text-center">
            No payroll runs yet. Use &ldquo;New pay run&rdquo; to create one.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                {['Entity', 'Period', 'Employees', 'Total Hours', 'Status', 'Xero', 'Actions'].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {runs.map((r) => {
                const entries = (r.payroll_entries ?? []) as { profile_id: string; band_hours: Record<string, number> }[]
                const empCount = entries.length
                const totalHours = entries.reduce((s, e) => s + bandTotal(e.band_hours), 0)
                const ent = entityMap[r.business_entity_id]
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 pr-4 font-medium">{ent?.name ?? '—'}</td>
                    <td className="py-3 pr-4 text-muted whitespace-nowrap">{r.period_start} – {r.period_end}</td>
                    <td className="py-3 pr-4 text-center">{empCount}</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{formatHours(totalHours)}</td>
                    <td className="py-3 pr-4"><Badge status={r.status} /></td>
                    <td className="py-3 pr-4"><Badge status={r.xero_sync_status} /></td>
                    <td className="py-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        {/* Preview export — works now */}
                        <a
                          href={`/api/xero/payroll-preview?run=${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
                          style={{ background: 'rgba(154,122,78,0.10)', color: '#836439' }}
                        >
                          <ExternalLink size={11} /> Preview export
                        </a>

                        {r.status === 'draft' && (
                          <form action={updatePayrollStatusAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="approved" />
                            <button type="submit" className="text-xs px-2.5 py-1 bg-slate-800 text-white hover:bg-slate-700 rounded-lg font-medium transition-colors">
                              Approve
                            </button>
                          </form>
                        )}

                        <form action={deletePayrollRunAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </Card>
      )}
    </div>
  )
}
