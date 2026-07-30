'use client'
import { useRouter, usePathname } from 'next/navigation'
import { FileText } from 'lucide-react'
import Dropdown from '@/components/dropdown'

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
    'bg-white border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all'

  return (
    <div className="flex flex-wrap items-end gap-4 mb-6 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
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
        <Dropdown
          value={entity}
          onChange={(v) => update('entity', v)}
          buttonClassName="min-w-[160px]"
          options={[{ value: '', label: 'All entities' }, ...entities.map((e) => ({ value: e.id, label: e.name }))]}
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

      {/* Per-employee fortnightly timesheet PDF — needs a specific employee. */}
      {employee ? (
        <a
          href={`/api/reports/timesheet?employee=${employee}&from=${from}&to=${to}`}
          className="inline-flex items-center gap-2 h-[38px] px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all active:scale-95 self-end"
          style={{ background: '#1C1A16' }}
        >
          <FileText size={15} /> Timesheet PDF
        </a>
      ) : (
        <span className="text-xs text-muted self-end pb-2 max-w-[200px]">
          Pick an employee to download their fortnightly timesheet PDF.
        </span>
      )}
    </div>
  )
}
