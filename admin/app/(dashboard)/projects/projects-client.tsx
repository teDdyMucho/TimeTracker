'use client'
import { Fragment, useState } from 'react'
import { Card, Badge } from '@/components/ui'
import { toggleProjectStatusAction } from './actions'

interface Entity { id: string; name: string }
interface Project {
  id: string
  name: string
  client: string | null
  code: string | null
  business_entity_id: string
  status: string
}

export default function ProjectsClient({
  entities,
  projects,
}: {
  entities: Entity[]
  projects: Project[]
}) {
  const [activeId, setActiveId] = useState<string | 'all'>('all')

  const visible =
    activeId === 'all'
      ? projects
      : projects.filter((p) => p.business_entity_id === activeId)

  const grouped =
    activeId === 'all'
      ? entities
          .map((e) => ({ entity: e, rows: projects.filter((p) => p.business_entity_id === e.id) }))
          .filter((g) => g.rows.length > 0)
      : [
          {
            entity: entities.find((e) => e.id === activeId)!,
            rows: visible,
          },
        ]

  return (
    <>
      {/* ── Entity filter tabs ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-6 p-1 bg-white rounded-2xl border border-slate-100 shadow-card w-fit">
        <button
          onClick={() => setActiveId('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
            activeId === 'all'
              ? 'text-white shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
          style={activeId === 'all' ? { background: 'linear-gradient(135deg, #9A7A4E, #836439)' } : {}}
        >
          All
        </button>
        {entities.map((e) => {
          const count = projects.filter((p) => p.business_entity_id === e.id).length
          const active = activeId === e.id
          return (
            <button
              key={e.id}
              onClick={() => setActiveId(e.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                active ? 'text-white shadow-sm' : 'text-muted hover:text-ink'
              }`}
              style={active ? { background: 'linear-gradient(135deg, #9A7A4E, #836439)' } : {}}
            >
              {e.name}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Projects table ─────────────────────────────────────── */}
      <Card>
        {visible.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No projects for this entity yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm table-fixed min-w-[780px]">
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Client', 'Entity', 'Code', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ entity, rows }, gi) => (
                <Fragment key={entity.id}>
                  {/* Entity group label row */}
                  <tr key={`hdr-${entity.id}`}>
                    <td
                      colSpan={6}
                      className={`pb-2 text-[10px] font-bold text-muted uppercase tracking-[0.18em] ${
                        gi > 0 ? 'pt-6 border-t border-slate-200' : 'pt-4'
                      }`}
                    >
                      {entity.name}
                    </td>
                  </tr>

                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3 pr-4 font-semibold text-ink truncate">{p.name}</td>
                      <td className="py-3 pr-4 text-muted truncate">{p.client ?? '—'}</td>
                      <td className="py-3 pr-4 text-muted text-xs truncate">{entity.name}</td>
                      <td className="py-3 pr-4 text-muted font-mono text-xs">{p.code ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge status={p.status} />
                      </td>
                      <td className="py-3">
                        <form action={toggleProjectStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="current_status" value={p.status} />
                          <button
                            type="submit"
                            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm whitespace-nowrap ${
                              p.status === 'active'
                                ? 'bg-slate-700 text-white hover:bg-slate-800'
                                : 'bg-brand text-white hover:bg-brand-dark'
                            }`}
                          >
                            {p.status === 'active' ? 'Archive' : 'Restore'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  )
}
