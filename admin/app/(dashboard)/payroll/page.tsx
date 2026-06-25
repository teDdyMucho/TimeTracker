import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { updatePayrollStatusAction, deletePayrollRunAction } from './actions'
import NewPayrollRunForm from './new-run-form'
import { formatHours } from '@/lib/format'
import { ExternalLink, Trash2 } from 'lucide-react'
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
        'id, period_start, period_end, status, xero_sync_status, created_at, business_entity_id, payroll_entries(profile_id, band_hours, gross_pay)',
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
                {['Entity', 'Period', 'Employees', 'Total Hours', 'Gross Pay', 'Status', 'Xero', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className={`pb-3 pr-4 font-medium text-muted whitespace-nowrap ${h === 'Actions' ? 'text-right' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {runs.map((r) => {
                const entries = (r.payroll_entries ?? []) as { profile_id: string; band_hours: Record<string, number>; gross_pay: number }[]
                const empCount = entries.length
                const totalHours = entries.reduce((s, e) => s + bandTotal(e.band_hours), 0)
                const totalGross = entries.reduce((s, e) => s + Number(e.gross_pay || 0), 0)
                const ent = entityMap[r.business_entity_id]
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 pr-4 font-medium">
                      <Link href={`/payroll/${r.id}`} className="hover:underline" style={{ color: '#9A7A4E' }}>
                        {ent?.name ?? '—'}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-muted whitespace-nowrap">{r.period_start} – {r.period_end}</td>
                    <td className="py-3 pr-4 text-center">{empCount}</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{formatHours(totalHours)}</td>
                    <td className="py-3 pr-4 font-bold tabular-nums">
                      {totalGross > 0 ? `$${totalGross.toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : <span className="text-muted font-normal">—</span>}
                    </td>
                    <td className="py-3 pr-4"><Badge status={r.status} /></td>
                    <td className="py-3 pr-4"><Badge status={r.xero_sync_status} /></td>
                    <td className="py-3">
                      <div className="flex gap-1.5 items-center justify-end flex-nowrap">
                        <Link
                          href={`/payroll/${r.id}`}
                          className="inline-flex items-center h-7 px-3 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          View salaries
                        </Link>

                        {/* Preview export */}
                        <a
                          href={`/api/xero/payroll-preview?run=${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Preview Xero export"
                          className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                          style={{ background: 'rgba(154,122,78,0.10)', color: '#836439' }}
                        >
                          <ExternalLink size={12} /> Preview
                        </a>

                        {r.status === 'draft' && (
                          <form action={updatePayrollStatusAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="approved" />
                            <button
                              type="submit"
                              className="inline-flex items-center h-7 px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap"
                              style={{ borderColor: 'rgba(154,122,78,0.35)', color: '#836439' }}
                            >
                              Approve
                            </button>
                          </form>
                        )}

                        <form action={deletePayrollRunAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            title="Delete pay run"
                            aria-label="Delete pay run"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
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
