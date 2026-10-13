'use client'
import { Fragment, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { toggleProjectStatusAction } from './actions'
import EditProjectForm from './edit-project-form'
import { formatHours } from '@/lib/format'
import type { BusinessEntity } from '@/lib/types'

interface Entity { id: string; name: string }
interface Project {
  id: string
  name: string
  client: string | null
  code: string | null
  business_entity_id: string
  status: string
  budget_hours: number | null
  budget_labour_cost: number | null
  start_date: string | null
  end_date: string | null
  actual_hours: number
  actual_labour_cost: number
}

const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}

/** Budget vs actual bar: grey under budget, amber near, red over. */
function BudgetBar({ actual, budget, fmt }: { actual: number; budget: number | null; fmt: (n: number) => string }) {
  if (budget == null || budget <= 0) {
    return <span className="text-xs text-muted tabular-nums">{fmt(actual)}<span className="text-slate-300"> / no budget</span></span>
  }
  const pct = Math.round((actual / budget) * 100)
  const color = pct > 100 ? '#DC2626' : pct >= 90 ? '#D97706' : '#1C1A16'
  return (
    <div className="min-w-[140px]">
      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <span className="font-semibold" style={{ color }}>{fmt(actual)}</span>
        <span className="text-muted">/ {fmt(budget)}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: '#F2F0EA' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <div className="text-[10px] mt-0.5" style={{ color }}>
        {pct}% used{pct > 100 ? ` · ${fmt(actual - budget)} over` : ''}
      </div>
    </div>
  )
}

export default function ProjectsClient({
  entities,
  projects,
}: {
  entities: Entity[]
  projects: Project[]
}) {
  const [activeId, setActiveId] = useState<string | 'all'>('all')
  const [editing, setEditing] = useState<Project | null>(null)

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
      {editing && (
        <EditProjectForm
          project={editing}
          entities={entities as BusinessEntity[]}
          onClose={() => setEditing(null)}
        />
      )}

      {/* ── Entity filter tabs ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-6 p-1 bg-white rounded-2xl border border-line shadow-card w-fit">
        <button
          onClick={() => setActiveId('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 ${
            activeId === 'all'
              ? 'bg-[#1C1A16] text-white shadow-sm'
              : 'text-muted hover:bg-stone hover:text-ink'
          }`}
        >
          All
        </button>
        {entities.map((e) => {
          // Tab count shows ACTIVE projects only (per requirement).
          const count = projects.filter((p) => p.business_entity_id === e.id && p.status === 'active').length
          const active = activeId === e.id
          return (
            <button
              key={e.id}
              onClick={() => setActiveId(e.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 ${
                active ? 'bg-[#1C1A16] text-white shadow-sm' : 'text-muted hover:bg-stone hover:text-ink'
              }`}
            >
              {e.name}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                  active ? 'bg-white/20 text-white' : 'bg-stone text-muted'
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
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1060px]">
            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Client', 'Code', 'Dates', 'Hours (actual / budget)', 'Labour cost (actual / budget)', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap"
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
                      colSpan={8}
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
                      className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors align-top"
                    >
                      <td className="py-3 pr-4 font-semibold text-ink max-w-[220px] truncate">{p.name}</td>
                      <td className="py-3 pr-4 text-muted max-w-[160px] truncate">{p.client ?? '—'}</td>
                      <td className="py-3 pr-4 text-muted font-mono text-xs">{p.code ?? '—'}</td>
                      <td className="py-3 pr-4 text-muted text-xs whitespace-nowrap">
                        {p.start_date || p.end_date
                          ? `${fmtDate(p.start_date) || '…'} → ${fmtDate(p.end_date) || '…'}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <BudgetBar actual={p.actual_hours} budget={p.budget_hours} fmt={(n) => formatHours(n)} />
                      </td>
                      <td className="py-3 pr-4">
                        <BudgetBar actual={p.actual_labour_cost} budget={p.budget_labour_cost} fmt={money} />
                      </td>
                      <td className="py-3 pr-4">
                        <Badge status={p.status} />
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setEditing(p)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm whitespace-nowrap"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          <form action={toggleProjectStatusAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="current_status" value={p.status} />
                            <button
                              type="submit"
                              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm whitespace-nowrap ${
                                p.status === 'active'
                                  ? 'bg-red-500 text-white hover:bg-red-600'
                                  : 'bg-brand text-white hover:bg-brand-dark'
                              }`}
                            >
                              {p.status === 'active' ? 'Archive' : 'Restore'}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      <p className="text-xs mt-4" style={{ color: '#A39C90' }}>
        Actual hours and labour cost come from approved attendance, costed the same way as payroll
        (overtime, weekend and public-holiday loading included). Set budgets with Edit.
      </p>
    </>
  )
}
