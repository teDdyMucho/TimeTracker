'use client'
import { useRouter, usePathname } from 'next/navigation'
import { FileText } from 'lucide-react'
import Dropdown from '@/components/dropdown'

export default function ReportsFilter({
  from,
  to,
  entity,
  employee,
  project,
  entities,
  employees,
  projects,
  periods = [],
  period = '',
}: {
  from: string
  to: string
  entity: string
  employee: string
  project: string
  entities: { id: string; name: string }[]
  employees: { id: string; name: string }[]
  projects: { id: string; name: string; business_entity_id: string }[]
  /** TV4 / TV7: pay periods from Settings → Pay cycle; picking one sets From/To. */
  periods?: { start: string; end: string; label: string }[]
  period?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string) {
    const params = new URLSearchParams({ from, to, entity, employee, project, [key]: value })
    // Changing entity invalidates a project from another entity.
    if (key === 'entity' && project) {
      const p = projects.find((x) => x.id === project)
      if (p && value && p.business_entity_id !== value) params.delete('project')
    }
    for (const k of ['entity', 'employee', 'project']) if (!params.get(k)) params.delete(k)
    router.push(`${pathname}?${params}`)
  }

  const selectClass =
    'bg-white border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all'

  const projectOptions = projects.filter((p) => !entity || p.business_entity_id === entity)

  function setPeriod(value: string) {
    const [start, end] = value.split('_')
    const params = new URLSearchParams({ from: start, to: end })
    if (entity) params.set('entity', entity)
    if (employee) params.set('employee', employee)
    if (project) params.set('project', project)
    router.push(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-4 mb-6 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
      {periods.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Pay period</label>
          <Dropdown
            value={period}
            onChange={(v) => v && setPeriod(v)}
            buttonClassName="min-w-[220px]"
            options={[{ value: '', label: period ? 'Custom range' : 'Custom range (dates below)' }, ...periods.map((p) => ({ value: `${p.start}_${p.end}`, label: p.label }))]}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">From</label>
        <input
          type="date"
          defaultValue={from}
          onChange={(e) => e.target.value && update('from', e.target.value)}
          className={selectClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">To</label>
        <input
          type="date"
          defaultValue={to}
          onChange={(e) => e.target.value && update('to', e.target.value)}
          className={selectClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Business</label>
        <Dropdown
          value={entity}
          onChange={(v) => update('entity', v)}
          buttonClassName="min-w-[160px]"
          options={[{ value: '', label: 'All businesses' }, ...entities.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Project</label>
        <Dropdown
          value={project}
          onChange={(v) => update('project', v)}
          buttonClassName="min-w-[180px]"
          options={[{ value: '', label: 'All projects' }, ...projectOptions.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Employee</label>
        <Dropdown
          value={employee}
          onChange={(v) => update('employee', v)}
          buttonClassName="min-w-[160px]"
          options={[{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </div>

      {/* TV10: timesheets for the employee (or everyone) over this range, as Excel or PDF. */}
      <div className="flex gap-2 self-end">
        {[['pdf', 'Timesheets PDF'], ['xlsx', 'Timesheets Excel']].map(([f, label]) => (
          <a
            key={f}
            href={`/api/timesheets/export?format=${f}&from=${from}&to=${to}${employee ? `&employee=${employee}` : ''}${entity ? `&entity=${entity}` : ''}`}
            className="inline-flex items-center gap-2 h-[38px] px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all active:scale-95"
            style={{ background: '#1C1A16' }}
          >
            <FileText size={15} /> {label}
          </a>
        ))}
      </div>
    </div>
  )
}
