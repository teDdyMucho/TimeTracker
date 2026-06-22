import { createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { toggleEntityStatusAction } from './actions'
import NewEntityForm from './new-entity-form'

export default async function EntitiesPage() {
  const adminClient = createAdminClient()

  const { data: entities } = await adminClient
    .from('business_entities')
    .select('id, name, status, xero_tenant_id, created_at')
    .order('name')

  const rows = entities ?? []
  const activeCount = rows.filter((e) => e.status === 'active').length

  return (
    <div>
      <PageHeader
        title="Business Entities"
        subtitle={`${activeCount} active`}
        action={<NewEntityForm />}
      />

      <Card>
        {rows.length === 0 ? (
          <p className="text-muted text-sm py-4">
            No entities yet. Add Build One and ARKO Joinery to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100">
                {['Name', 'Xero Tenant ID', 'Status', ''].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-medium text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium">{e.name}</td>
                  <td className="py-3 pr-4 text-muted font-mono text-xs">
                    {e.xero_tenant_id ?? (
                      <span className="text-slate-300 italic">Not connected</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={e.status} />
                  </td>
                  <td className="py-3">
                    <form action={toggleEntityStatusAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="current_status" value={e.status} />
                      <button
                        type="submit"
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          e.status === 'active'
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {e.status === 'active' ? 'Archive' : 'Restore'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-6 bg-blue-50 rounded-2xl px-5 py-4 text-sm text-blue-700">
        <strong>Tip:</strong> After connecting Xero (coming soon), the Xero Tenant ID will appear
        here automatically per entity.
      </div>
    </div>
  )
}
