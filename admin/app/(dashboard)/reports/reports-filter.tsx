'use client'
import { useRouter, usePathname } from 'next/navigation'

export default function ReportsFilter({
  from,
  to,
  entity,
  employee,
  entities,
  employees,
}: {
  from: string
  to: string
  entity: string
  employee: string
  entities: { id: string; name: string }[]
  employees: { id: string; name: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string) {
    const params = new URLSearchParams({ from, to, entity, employee, [key]: value })
    if (!params.get('entity')) params.delete('entity')
    if (!params.get('employee')) params.delete('employee')
    router.push(`${pathname}?${params}`)
  }

  const selectClass =
    'border border-slate-200 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all'

  return (
    <div className="flex flex-wrap items-end gap-4 mb-6 bg-white rounded-2xl border border-slate-100 px-5 py-4 shadow-card">
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
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Entity</label>
        <select
          defaultValue={entity}
          onChange={(e) => update('entity', e.target.value)}
          className={selectClass}
        >
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Employee</label>
        <select
          defaultValue={employee}
          onChange={(e) => update('employee', e.target.value)}
          className={selectClass}
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
