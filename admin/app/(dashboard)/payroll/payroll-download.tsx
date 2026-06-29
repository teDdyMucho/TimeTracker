'use client'
import { useState } from 'react'
import { Download } from 'lucide-react'
import Dropdown from '@/components/dropdown'

interface Opt { id: string; name: string }

/**
 * Filtered payroll PDF download. Scope follows the two dropdowns:
 *   entity + employee both empty  → all employees, all entities
 *   entity only                   → all employees in that entity
 *   employee only                 → that employee across all entities
 *   both                          → that employee in that entity
 */
export default function PayrollDownload({
  entities,
  employees,
}: {
  entities: Opt[]
  employees: Opt[]
}) {
  const [entity, setEntity] = useState('')
  const [employee, setEmployee] = useState('')

  const href = (() => {
    const p = new URLSearchParams()
    if (entity) p.set('entity', entity)
    if (employee) p.set('employee', employee)
    const qs = p.toString()
    return `/api/payroll/pdf${qs ? `?${qs}` : ''}`
  })()

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Entity</label>
        <Dropdown
          value={entity}
          onChange={setEntity}
          buttonClassName="min-w-[170px]"
          options={[{ value: '', label: 'All entities' }, ...entities.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Employee</label>
        <Dropdown
          value={employee}
          onChange={setEmployee}
          buttonClassName="min-w-[170px]"
          options={[{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 shadow-sm hover:opacity-90"
        style={{ background: '#1C1A16' }}
      >
        <Download size={15} /> Download PDF
      </a>
      <p className="text-xs text-muted self-center max-w-[280px]">
        Exports payroll for the selected scope across all matching pay runs.
      </p>
    </div>
  )
}
