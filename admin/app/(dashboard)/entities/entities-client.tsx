'use client'
import { useState } from 'react'
import { Card, PageHeader, Badge } from '@/components/ui'
import { toggleEntityStatusAction } from './actions'
import NewEntityForm from './new-entity-form'
import EditEntityForm from './edit-entity-form'
import { Pencil } from 'lucide-react'

interface Entity {
  id: string
  name: string
  status: string
  xero_tenant_id: string | null
}

export default function EntitiesClient({
  entities,
  activeCount,
}: {
  entities: Entity[]
  activeCount: number
}) {
  const [editing, setEditing] = useState<Entity | null>(null)

  return (
    <div>
      <PageHeader
        title="Business Entities"
        subtitle={`${activeCount} active`}
        action={<NewEntityForm />}
      />

      {editing && (
        <EditEntityForm entity={editing} onClose={() => setEditing(null)} />
      )}

      <Card>
        {entities.length === 0 ? (
          <p className="text-muted text-sm py-4">
            No entities yet. Add Build One and ARKO Joinery to get started.
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left border-b border-slate-200">
                {['Name', 'Xero Tenant ID', 'Status', ''].map((h) => (
                  <th key={h} className="pb-3 pr-4 text-[10px] font-semibold text-muted uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entities.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-ink">{e.name}</td>
                  <td className="py-3 pr-4 text-muted font-mono text-xs">
                    {e.xero_tenant_id ?? (
                      <span className="text-slate-300 italic">Not connected</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={e.status} />
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(e)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                      >
                        <Pencil size={11} />
                        Edit
                      </button>
                      <form action={toggleEntityStatusAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="current_status" value={e.status} />
                        <button
                          type="submit"
                          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm whitespace-nowrap ${
                            e.status === 'active'
                              ? 'bg-slate-700 text-white hover:bg-slate-800'
                              : 'bg-brand text-white hover:bg-brand-dark'
                          }`}
                        >
                          {e.status === 'active' ? 'Archive' : 'Restore'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <div className="mt-6 bg-blue-50 rounded-2xl px-5 py-4 text-sm text-blue-700">
        <strong>Tip:</strong> After connecting Xero (coming soon), the Xero Tenant ID will appear
        here automatically per entity.
      </div>
    </div>
  )
}
