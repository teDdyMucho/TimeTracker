'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Dropdown from '@/components/dropdown'

interface Option { id: string; name: string }

export default function AttendanceFilter({
  date,
  today,
  employees,
  companies,
  employeeId,
  entityId,
}: {
  date: string
  today: string
  employees: Option[]
  companies: Option[]
  employeeId: string
  entityId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Update one param while keeping the others; empty value removes that param.
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  // Date buttons: '' = today (no param), 'all' = every day.
  function goDate(value: string) {
    setParam('date', value)
  }

  const btn = 'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all duration-150 active:scale-95 hover:opacity-90'
  const activeStyle = { background: '#1C1A16', color: '#fff', borderColor: '#1C1A16' }
  const idleStyle = { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }

  return (
    <div className="flex flex-wrap items-end gap-3 mb-5 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">View date</label>
        <input
          type="date"
          value={date === 'all' ? '' : date}
          max={today}
          onChange={(e) => goDate(e.target.value)}
          className="border border-line rounded-xl px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
        />
      </div>

      <button type="button" onClick={() => goDate(today)} className={btn} style={date === today ? activeStyle : idleStyle}>
        Today
      </button>
      <button type="button" onClick={() => goDate('all')} className={btn} style={date === 'all' ? activeStyle : idleStyle}>
        All days
      </button>

      {/* Employee */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Employee</label>
        <Dropdown
          value={employeeId}
          onChange={(v) => setParam('employee', v)}
          buttonClassName="min-w-[160px]"
          options={[{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </div>

      {/* Company */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Company</label>
        <Dropdown
          value={entityId}
          onChange={(v) => setParam('entity', v)}
          buttonClassName="min-w-[160px]"
          options={[{ value: '', label: 'All companies' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>

      {/* Clear filters — only when an employee/company filter is active */}
      {(employeeId || entityId) && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete('employee')
            params.delete('entity')
            const qs = params.toString()
            router.push(qs ? `${pathname}?${qs}` : pathname)
          }}
          className="px-3.5 py-2 rounded-xl text-sm font-medium text-muted hover:text-ink hover:bg-stone transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}
