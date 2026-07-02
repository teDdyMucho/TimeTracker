'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Banknote,
  Briefcase,
  ChevronDown,
  Landmark,
  LayoutGrid,
  LogOut,
  ScanLine,
  Timer,
  Users,
} from 'lucide-react'
import { signOutAction } from '@/app/actions'
import ConfirmModal from '@/components/confirm-modal'

const NAV = [
  { href: '/',           label: 'Dashboard',  icon: LayoutGrid },
  { href: '/employees',  label: 'Employees',  icon: Users },
  { href: '/entities',   label: 'Entities',   icon: Landmark },
  { href: '/projects',   label: 'Projects',   icon: Briefcase },
  { href: '/attendance', label: 'Attendance', icon: ScanLine },
  { href: '/overtime',   label: 'Overtime',   icon: Timer, badge: true },
  { href: '/reports',    label: 'Reports',    icon: BarChart3 },
  { href: '/payroll',    label: 'Payroll',    icon: Banknote },
]

// Pure-black monochrome sidebar palette
const BG          = '#000000'   // true black
const ACTIVE_BG   = '#1F1F22'   // dark grey active pill (visible on black)
const HOVER_BG    = 'rgba(255,255,255,0.06)'
const CARD_BG     = 'rgba(255,255,255,0.06)'
const TEXT_OFF    = '#A1A1AA'
const TEXT_FAINT  = '#71717A'
const GREEN       = '#FFFFFF'   // accent on black sidebar — white for contrast
const DIVIDER     = 'rgba(255,255,255,0.08)'

function SessionClock() {
  const [time, setTime] = useState('--:--:--')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-GB', { timeZone: 'Australia/Brisbane', hour12: false }))
      setDate(now.toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'short', day: 'numeric', month: 'short' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mx-3 mb-3 rounded-2xl p-4" style={{ background: CARD_BG }}>
      <div className="text-[9px] font-bold tracking-[0.16em] uppercase mb-2.5" style={{ color: TEXT_FAINT }}>
        Current Session
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: GREEN }} />
          <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: GREEN }} />
        </span>
        <span className="text-xs font-medium" style={{ color: TEXT_OFF }}>Signed in · {date}</span>
      </div>
      <div className="text-[28px] font-bold tabular-nums tracking-tight leading-none text-white">
        {time}
      </div>
    </div>
  )
}

interface Props {
  pendingOvertimeCount: number
  userName: string
  userEmail: string
}

export default function Sidebar({ pendingOvertimeCount, userName, userEmail }: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const signOutFormRef = useRef<HTMLFormElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  return (
    <aside className="w-60 flex flex-col h-full shrink-0" style={{ background: BG }}>

      {/* ── Brand ─────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/timevera-web.png?v=3"
          alt="Timevera"
          className="w-full h-auto object-contain"
        />
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-1 space-y-1.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const badgeCount = badge ? pendingOvertimeCount : 0

          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-150"
              style={active ? { background: ACTIVE_BG, color: '#FFFFFF' } : { color: TEXT_OFF }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = HOVER_BG }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 20, background: GREEN }} />
              )}
              <span className="flex items-center gap-3">
                <Icon size={17} className="shrink-0" strokeWidth={2} style={{ color: active ? GREEN : TEXT_FAINT }} />
                <span>{label}</span>
              </span>
              {badgeCount > 0 && (
                <span
                  className="text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center"
                  style={active ? { background: '#FFFFFF', color: '#1C1A16' } : { background: 'rgba(255,255,255,0.14)', color: '#E4E4E7' }}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Current session card ───────────────────────────── */}
      <SessionClock />

      {/* ── User footer ────────────────────────────────────── */}
      <div className="px-3 pb-5 pt-3 relative" style={{ borderTop: `1px solid ${DIVIDER}` }} ref={menuRef}>

        {/* Hidden sign-out form — submitted by the confirm modal */}
        <form action={signOutAction} ref={signOutFormRef} className="hidden" />

        {/* Dropdown (opens upward) */}
        {menuOpen && (
          <div
            className="absolute left-3 right-3 bottom-full mb-2 rounded-xl overflow-hidden z-50 animate-fade-in"
            style={{ background: '#1F1F22', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 14px 36px -10px rgba(0,0,0,0.7)' }}
          >
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setConfirmOpen(true) }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors"
              style={{ color: '#FCA5A5' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        )}

        <ConfirmModal
          open={confirmOpen}
          title="Log out?"
          message="You'll need to sign in again to access the dashboard."
          confirmLabel="Log out"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); signOutFormRef.current?.requestSubmit() }}
        />

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl transition-colors"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/timevera-white.png?v=1" alt="Timevera" className="w-full h-full object-contain scale-[1.15]" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold truncate text-white">{userName}</div>
            <div className="text-[11px] truncate" style={{ color: TEXT_FAINT }}>{userEmail || 'Administrator'}</div>
          </div>
          <ChevronDown size={15} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} style={{ color: TEXT_FAINT }} />
        </button>
      </div>
    </aside>
  )
}
