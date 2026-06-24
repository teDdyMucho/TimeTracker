'use client'
import { useRouter, usePathname } from 'next/navigation'

export default function AttendanceFilter({ date, today }: { date: string; today: string }) {
  const router = useRouter()
  const pathname = usePathname()

  function go(value: string) {
    if (!value) {
      router.push(pathname)
      return
    }
    const params = new URLSearchParams({ date: value })
    router.push(`${pathname}?${params}`)
  }

  const btn = 'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors'

  return (
    <div className="flex flex-wrap items-end gap-3 mb-5 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">View date</label>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => go(e.target.value)}
          className="border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
        />
      </div>

      <button
        type="button"
        onClick={() => go(today)}
        className={btn}
        style={
          date === today
            ? { background: '#9A7A4E', color: '#fff', borderColor: '#9A7A4E' }
            : { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }
        }
      >
        Today
      </button>

      <button
        type="button"
        onClick={() => go('')}
        className={btn}
        style={
          date === ''
            ? { background: '#9A7A4E', color: '#fff', borderColor: '#9A7A4E' }
            : { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }
        }
      >
        All days
      </button>
    </div>
  )
}
