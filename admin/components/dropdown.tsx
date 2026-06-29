'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
}

/**
 * Custom select with a GREY hover/selected highlight (no native blue).
 * Drop-in replacement for a <select> where the open-menu styling matters.
 * Renders a hidden <input name> so it still works inside <form action>.
 */
export default function Dropdown({
  value,
  onChange,
  options,
  name,
  placeholder = 'Select…',
  className = '',
  buttonClassName = '',
  triggerAsHeader = false,
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  name?: string
  placeholder?: string
  className?: string
  buttonClassName?: string
  /** When true, renders a borderless text trigger (for use as a table header). */
  triggerAsHeader?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  const selected = options.find((o) => o.value === value)

  const trigger = triggerAsHeader
    ? `inline-flex items-center gap-1 font-medium text-muted hover:text-ink cursor-pointer focus:outline-none transition-colors ${buttonClassName}`
    : `w-full flex items-center justify-between border border-line rounded-xl px-4 py-2.5 text-ink text-sm bg-white hover:border-[#1C1A16]/40 hover:bg-stone/60 focus:outline-none focus:ring-2 focus:ring-brand/25 transition-all duration-150 active:scale-[0.98] ${buttonClassName}`

  return (
    <div className={`relative ${className}`} ref={ref}>
      {name && <input type="hidden" name={name} value={value} />}
      <button type="button" onClick={() => setOpen((v) => !v)} className={trigger}>
        <span className={selected ? 'text-ink' : 'text-muted'}>{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={triggerAsHeader ? 12 : 16}
          className={`opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="dropdown-menu absolute left-0 mt-1.5 min-w-full w-max max-w-[260px] rounded-xl border border-line bg-white shadow-card-hover overflow-hidden z-50 py-1">
          {options.map((o) => {
            const isSel = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`group w-full flex items-center justify-between gap-3 px-3.5 py-2 text-sm text-left transition-colors duration-150 hover:bg-[#1C1A16] hover:text-white ${
                  isSel ? 'bg-stone text-ink font-semibold' : 'text-ink'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {isSel && <Check size={14} className="shrink-0 group-hover:text-white" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
