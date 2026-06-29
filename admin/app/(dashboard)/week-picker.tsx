'use client'
import { useRouter, usePathname } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

export default function WeekPicker({
  weekStart,
  label,
  prevWeek,
  nextWeek,
  today,
  isCurrentWeek,
}: {
  weekStart: string
  label: string
  prevWeek: string
  nextWeek: string
  today: string
  isCurrentWeek: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()

  const go = (date: string) => {
    const params = new URLSearchParams({ week: date })
    router.push(`${pathname}?${params}`)
  }

  return (
    <div className="flex items-center gap-2">
      {!isCurrentWeek && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#FAF9F6]"
          style={{ color: '#1C1A16', borderColor: '#ECEAE4', background: '#fff' }}
        >
          This Week
        </button>
      )}

      <div className="flex items-center rounded-xl bg-white border border-[#ECEAE4] overflow-hidden">
        <button
          type="button"
          onClick={() => go(prevWeek)}
          className="px-2.5 py-2.5 hover:bg-[#FAF9F6] transition-colors"
          title="Previous week"
        >
          <ChevronLeft size={16} style={{ color: '#6B6660' }} />
        </button>

        <label
          className="relative flex items-center gap-2 px-3 py-2.5 text-sm font-semibold cursor-pointer border-x border-[#ECEAE4]"
          style={{ color: '#6B6660' }}
        >
          <CalendarDays size={15} style={{ color: '#B4AEA3' }} />
          {label}
          <ChevronDown size={14} style={{ color: '#B4AEA3' }} />
          <input
            type="date"
            value={weekStart}
            max={today}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>

        <button
          type="button"
          onClick={() => go(nextWeek)}
          disabled={isCurrentWeek}
          className="px-2.5 py-2.5 hover:bg-[#FAF9F6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next week"
        >
          <ChevronRight size={16} style={{ color: '#6B6660' }} />
        </button>
      </div>
    </div>
  )
}
