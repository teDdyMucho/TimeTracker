'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

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

  const select =
    'border border-line rounded-xl px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all min-w-[160px]'
  const btn = 'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors'
  const activeStyle = { background: '#9A7A4E', color: '#fff', borderColor: '#9A7A4E' }
  const idleStyle = { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }

  const tab = 'px-4 py-2 rounded-xl text-sm font-semibold transition-colors'

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
          className="border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
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
        <select value={employeeId} onChange={(e) => setParam('employee', e.target.value)} className={select}>
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {/* Company */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">Company</label>
        <select value={entityId} onChange={(e) => setParam('entity', e.target.value)} className={select}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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
          className="px-3.5 py-2 rounded-xl text-sm font-medium text-muted hover:text-ink hover:bg-slate-50 transition-colors"
        >
          Clear
        </button>
      )}
      </div>
    </>
  )
}
