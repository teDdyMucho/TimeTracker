'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Dropdown from '@/components/dropdown'

interface Option { id: string; name: string }

export default function OvertimeFilter({
  employees,
  companies,
  employeeId,
  entityId,
  date,
  today,
  view,
  pendingCount,
  reviewedCount,
}: {
  employees: Option[]
  companies: Option[]
  employeeId: string
  entityId: string
  date: string
  today: string
  view: 'pending' | 'reviewed'
  pendingCount: number
  reviewedCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const btn = 'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all duration-150 active:scale-95 hover:opacity-90'
  const activeStyle = { background: '#1C1A16', color: '#fff', borderColor: '#1C1A16' }
  const idleStyle = { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }

  const tab = 'px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 hover:opacity-90'

  return (
    <>
      {/* View toggle — Pending vs Reviewed (both use the same filters) */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setParam('view', '')}
          className={tab}
          style={view === 'pending' ? activeStyle : idleStyle}
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setParam('view', 'reviewed')}
          className={tab}
          style={view === 'reviewed' ? activeStyle : idleStyle}
        >
          Reviewed ({reviewedCount})
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-5 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">View date</label>
        <input
          type="date"
          value={date === 'all' ? '' : date}
          max={today}
          onChange={(e) => setParam('date', e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm text-ink bg-white border-line focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
        />
      </div>

      <button type="button" onClick={() => setParam('date', today)} className={btn} style={date === today ? activeStyle : idleStyle}>
        Today
      </button>
      <button type="button" onClick={() => setParam('date', '')} className={btn} style={date === '' ? activeStyle : idleStyle}>
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

      {(employeeId || entityId || (date && date !== 'all')) && (
        <button
          type="button"
          onClick={() => {
            // Clear filters but keep the current view tab.
            const params = new URLSearchParams()
            if (view === 'reviewed') params.set('view', 'reviewed')
            const qs = params.toString()
            router.push(qs ? `${pathname}?${qs}` : pathname)
          }}
          className="px-3.5 py-2 rounded-xl text-sm font-medium text-muted hover:text-ink hover:bg-stone transition-colors"
        >
          Clear
        </button>
      )}
      </div>
    </>
  )
}
