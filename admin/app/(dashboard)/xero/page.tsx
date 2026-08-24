import { createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import { CheckCircle2, XCircle, Users, Tags } from 'lucide-react'
import {
  getValidXeroToken,
  fetchXeroEmployees,
  fetchXeroEarningsRates,
  type XeroEmployee,
  type XeroEarningsRate,
} from '@/lib/xero'

export const dynamic = 'force-dynamic'

interface OrgData {
  entityId: string
  entityName: string
  tenantId: string
  connected: boolean
  error?: string
  employees: XeroEmployee[]
  rates: XeroEarningsRate[]
}

export default async function XeroPage() {
  const admin = createAdminClient()

  const { data: entities } = await admin
    .from('business_entities')
    .select('id, name, xero_tenant_id')
    .eq('status', 'active')
    .order('name')

  const linked = (entities ?? []).filter((e) => e.xero_tenant_id)

  // Fetch live Xero data for each connected entity.
  const orgs: OrgData[] = await Promise.all(
    linked.map(async (e) => {
      try {
        const token = await getValidXeroToken(e.xero_tenant_id!)
        const [employees, rates] = await Promise.all([
          fetchXeroEmployees(token, e.xero_tenant_id!),
          fetchXeroEarningsRates(token, e.xero_tenant_id!),
        ])
        return { entityId: e.id, entityName: e.name, tenantId: e.xero_tenant_id!, connected: true, employees, rates }
      } catch (err) {
        return {
          entityId: e.id,
          entityName: e.name,
          tenantId: e.xero_tenant_id!,
          connected: false,
          error: err instanceof Error ? err.message : 'Failed to load Xero data.',
          employees: [],
          rates: [],
        }
      }
    }),
  )

  return (
    <div>
      <PageHeader
        title="Xero"
        subtitle="Employees and pay categories pulled live from your connected Xero organisation."
      />

      {linked.length === 0 ? (
        <Card>
          <p className="text-muted text-sm py-6 text-center">
            No entity is connected to Xero yet. Go to <strong className="text-ink">Entities</strong> and click{' '}
            <em>Connect Xero</em> to link an organisation.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {orgs.map((org) => (
            <div key={org.entityId}>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-ink">{org.entityName}</h2>
                {org.connected ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#15803D' }}>
                    <CheckCircle2 size={14} /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                    <XCircle size={14} /> Error
                  </span>
                )}
              </div>

              {!org.connected ? (
                <Card>
                  <p className="text-sm text-red-600 break-words">{org.error}</p>
                  <p className="text-xs text-muted mt-2">Try reconnecting this entity in Entities → Reconnect.</p>
                </Card>
              ) : (
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Employees */}
                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={17} className="text-ink" />
                      <h3 className="font-bold text-ink">Employees</h3>
                      <span className="text-xs text-muted ml-auto">{org.employees.length}</span>
                    </div>
                    {org.employees.length === 0 ? (
                      <p className="text-muted text-sm">No employees found in Xero.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-slate-100">
                            <th className="pb-2 font-medium text-muted">Name</th>
                            <th className="pb-2 font-medium text-muted">Email</th>
                            <th className="pb-2 font-medium text-muted text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {org.employees.map((emp, i) => (
                            <tr key={i}>
                              <td className="py-2 pr-3 font-medium text-ink whitespace-nowrap">{emp.name || '—'}</td>
                              <td className="py-2 pr-3 text-muted text-xs break-all">{emp.email ?? '—'}</td>
                              <td className="py-2 text-right text-xs text-muted">{emp.status ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>

                  {/* Earnings rates */}
                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <Tags size={17} className="text-ink" />
                      <h3 className="font-bold text-ink">Pay categories (earnings rates)</h3>
                      <span className="text-xs text-muted ml-auto">{org.rates.length}</span>
                    </div>
                    {org.rates.length === 0 ? (
                      <p className="text-muted text-sm">No earnings rates found in Xero.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-slate-100">
                            <th className="pb-2 font-medium text-muted">Rate name</th>
                            <th className="pb-2 font-medium text-muted text-right">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {org.rates.map((rate, i) => (
                            <tr key={i}>
                              <td className="py-2 pr-3 font-medium text-ink">{rate.name}</td>
                              <td className="py-2 text-right text-xs text-muted">{rate.rateType ?? rate.earningsType ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
