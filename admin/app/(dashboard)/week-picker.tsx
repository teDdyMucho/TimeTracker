'use client'
import { useRef } from 'react'
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
  const dateRef = useRef<HTMLInputElement>(null)

  const go = (date: string) => {
    const params = new URLSearchParams({ week: date })
    router.push(`${pathname}?${params}`)
  }

  // Open the native date picker on click (transparent date inputs don't open on their own).
  const openPicker = () => {
    const el = dateRef.current
    if (!el) return
    // showPicker() is the reliable way; fall back to focus/click.
    if (typeof (el as any).showPicker === 'function') {
      try { (el as any).showPicker() } catch { el.focus() }
    } else {
      el.focus()
    }
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

        <button
          type="button"
          onClick={openPicker}
          className="relative flex items-center gap-2 px-3 py-2.5 text-sm font-semibold cursor-pointer border-x border-[#ECEAE4] hover:bg-[#FAF9F6] transition-colors"
          style={{ color: '#6B6660' }}
          title="Pick a week"
        >
          <CalendarDays size={15} style={{ color: '#B4AEA3' }} />
          {label}
          <ChevronDown size={14} style={{ color: '#B4AEA3' }} />
          <input
            ref={dateRef}
            type="date"
            value={weekStart}
            max={today}
            onChange={(e) => e.target.value && go(e.target.value)}
            // Kept in the DOM (not display:none) so showPicker() works; visually hidden.
            className="absolute bottom-0 left-1/2 w-px h-px opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden="true"
          />
        </button>

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
