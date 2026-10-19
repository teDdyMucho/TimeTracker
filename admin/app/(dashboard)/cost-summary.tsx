'use client'
import { useState } from 'react'
import { formatHours } from '@/lib/format'

export interface CostLine { id?: string; name: string; hours: number; cost: number; overtimeCost: number }

const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Tab = 'project' | 'employee' | 'entity' | 'location'

/**
 * Dashboard "Labour Cost Summary" (PRD §14): by project / employee / business /
 * location type for the selected week.
 */
export default function CostSummary({
  byProject,
  byEmployee,
  byEntity,
  byLocation,
  weekLabel,
}: {
  byProject: CostLine[]
  byEmployee: CostLine[]
  byEntity: CostLine[]
  byLocation: CostLine[]
  weekLabel: string
}) {
  const [tab, setTab] = useState<Tab>('project')
  const data: Record<Tab, CostLine[]> = { project: byProject, employee: byEmployee, entity: byEntity, location: byLocation }
  const rows = data[tab]
  const total = rows.reduce((s, r) => s + r.cost, 0)
  const maxCost = rows[0]?.cost ?? 1

  const tabs: { key: Tab; label: string }[] = [
    { key: 'project', label: 'By project' },
    { key: 'employee', label: 'By employee' },
    { key: 'entity', label: 'By business' },
    { key: 'location', label: 'Site vs workshop' },
  ]

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#1C1A16] shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-bold" style={{ color: '#2D2A26' }}>Labour Cost Summary</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8A857C' }}>{weekLabel} · approved hours, loaded with overtime / weekend rates</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F4F4F5' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={tab === t.key ? { background: '#1C1A16', color: '#fff' } : { color: '#6B6660' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: '#A39C90' }}>No approved hours this week.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th className="pb-2 pr-3 text-[10px] font-semibold text-muted uppercase tracking-widest">Name</th>
              <th className="pb-2 pr-3 text-[10px] font-semibold text-muted uppercase tracking-widest text-right">Hours</th>
              <th className="pb-2 pr-3 text-[10px] font-semibold text-muted uppercase tracking-widest text-right">OT cost</th>
              <th className="pb-2 text-[10px] font-semibold text-muted uppercase tracking-widest text-right">Labour cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.slice(0, 8).map((r, i) => (
              <tr key={r.id ?? `${r.name}-${i}`}>
                <td className="py-2.5 pr-3">
                  <div className="font-medium truncate max-w-[220px]" style={{ color: '#2D2A26' }}>{r.name}</div>
                  <div className="h-1 rounded-full overflow-hidden mt-1 max-w-[220px]" style={{ background: '#F2F0EA' }}>
                    <div className="h-full rounded-full" style={{ width: `${maxCost > 0 ? Math.round((r.cost / maxCost) * 100) : 0}%`, background: '#1C1A16' }} />
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{formatHours(r.hours)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{r.overtimeCost > 0 ? money(r.overtimeCost) : '—'}</td>
                <td className="py-2.5 text-right tabular-nums font-bold" style={{ color: '#2D2A26' }}>{money(r.cost)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <td className="pt-2.5 font-bold" style={{ color: '#2D2A26' }}>Total{rows.length > 8 ? ` (${rows.length})` : ''}</td>
              <td className="pt-2.5 pr-3 text-right tabular-nums font-semibold">{formatHours(rows.reduce((s, r) => s + r.hours, 0))}</td>
              <td className="pt-2.5 pr-3 text-right tabular-nums font-semibold">{money(rows.reduce((s, r) => s + r.overtimeCost, 0))}</td>
              <td className="pt-2.5 text-right tabular-nums font-black" style={{ color: '#2D2A26' }}>{money(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
