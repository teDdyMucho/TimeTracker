'use client'
import { useState } from 'react'
import { Card, PageHeader, Badge } from '@/components/ui'
import { toggleEntityStatusAction } from './actions'
import NewEntityForm from './new-entity-form'
import EditEntityForm from './edit-entity-form'
import { Pencil, Link2, CheckCircle, XCircle } from 'lucide-react'

interface Entity {
  id: string
  name: string
  status: string
  xero_tenant_id: string | null
}

interface XeroNotice {
  status: 'connected' | 'error'
  text: string
}

export default function EntitiesClient({
  entities,
  activeCount,
  xeroNotice,
}: {
  entities: Entity[]
  activeCount: number
  xeroNotice?: XeroNotice | null
}) {
  const [editing, setEditing] = useState<Entity | null>(null)

  return (
    <div>
      <PageHeader
        title="Business Entities"
        subtitle={`${activeCount} active`}
        action={<NewEntityForm />}
      />

      {/* Xero connection result */}
      {xeroNotice && (
        <div
          className="mb-5 rounded-2xl px-5 py-3.5 text-sm flex items-center gap-2.5"
          style={
            xeroNotice.status === 'connected'
              ? { background: 'rgba(28,26,22,0.10)', border: '1px solid rgba(28,26,22,0.22)', color: '#000000' }
              : { background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }
          }
        >
          {xeroNotice.status === 'connected' ? <CheckCircle size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
          {xeroNotice.text}
        </div>
      )}

      {editing && (
        <EditEntityForm entity={editing} onClose={() => setEditing(null)} />
      )}

      <Card className="!border-line">
        {entities.length === 0 ? (
          <p className="text-muted text-sm py-4">
            No entities yet. Add Build One and ARKO Joinery to get started.
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left border-b border-slate-200">
                {['Name', 'Xero', 'Status', ''].map((h) => (
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
                  <td className="py-3 pr-4">
                    {e.xero_tenant_id ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#16A34A' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#16A34A' }} />
                        Connected
                      </span>
                    ) : (
                      <span className="text-slate-300 italic text-xs">Not connected</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={e.status} />
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {/* Connect / Reconnect Xero — fixed width so Edit/Archive align across rows */}
                      <a
                        href={`/api/xero/connect?entity=${e.id}`}
                        className="inline-flex items-center justify-center gap-1.5 w-[124px] px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm whitespace-nowrap hover:opacity-90"
                        style={
                          e.xero_tenant_id
                            ? { background: '#F4F4F5', color: '#000000' }
                            : { background: '#1C1A16', color: '#fff' }
                        }
                      >
                        <Link2 size={11} />
                        {e.xero_tenant_id ? 'Reconnect' : 'Connect Xero'}
                      </a>

                      <button
                        onClick={() => setEditing(e)}
                        className="inline-flex items-center justify-center gap-1.5 w-[76px] px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                      >
                        <Pencil size={11} />
                        Edit
                      </button>

                      <form action={toggleEntityStatusAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="current_status" value={e.status} />
                        <button
                          type="submit"
                          className={`inline-flex items-center justify-center w-[84px] px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm whitespace-nowrap ${
                            e.status === 'active'
                              ? 'bg-red-500 text-white hover:bg-red-600'
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

      <div className="mt-6 rounded-2xl px-5 py-4 text-sm" style={{ background: 'rgba(28,26,22,0.08)', border: '1px solid rgba(28,26,22,0.18)', color: '#000000' }}>
        <strong>Xero:</strong> Click <em>Connect Xero</em> on an entity to link its Xero organisation.
        You&rsquo;ll be redirected to Xero to authorise, then the org is attached here — ready for payroll export.
      </div>
    </div>
  )
}
