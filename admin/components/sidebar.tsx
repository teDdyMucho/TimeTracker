'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Banknote,
  Briefcase,
  ClipboardList,
  Clock,
  Landmark,
  LayoutGrid,
  LogOut,
  ScanLine,
  Timer,
  Users,
} from 'lucide-react'
import { signOutAction } from '@/app/actions'

const NAV = [
  { href: '/',           label: 'Dashboard',  icon: LayoutGrid },
  { href: '/employees',  label: 'Employees',  icon: Users },
  { href: '/entities',   label: 'Entities',   icon: Landmark },
  { href: '/projects',   label: 'Projects',   icon: Briefcase },
  { href: '/attendance', label: 'Attendance', icon: ScanLine },
  { href: '/timesheets', label: 'Timesheets', icon: ClipboardList },
  { href: '/overtime',   label: 'Overtime',   icon: Timer, badge: true },
  { href: '/reports',    label: 'Reports',    icon: BarChart3 },
  { href: '/payroll',    label: 'Payroll',    icon: Banknote },
]

export default function Sidebar({ pendingOvertimeCount }: { pendingOvertimeCount: number }) {
  const pathname = usePathname()

  return (
    <aside
      className="w-64 flex flex-col h-full shrink-0"
      style={{ background: 'linear-gradient(180deg, #070D1A 0%, #0B1525 100%)' }}
    >
      {/* ── Brand ──────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-glow-brand"
            style={{ background: 'linear-gradient(135deg, #0ABFA3 0%, #07906F 100%)' }}
          >
            <Clock size={17} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-[15px] tracking-tight leading-tight">
              Timevera
            </div>
            <div
              className="text-[10px] font-semibold tracking-[0.18em] uppercase mt-px"
              style={{ color: 'rgba(255,255,255,0.28)' }}
            >
              Admin Portal
            </div>
          </div>
        </div>
      </div>

      <div className="mx-5 mb-3" style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const badgeCount = badge ? pendingOvertimeCount : 0

          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group"
              style={active
                ? { background: 'rgba(10,191,163,0.13)', color: '#0ABFA3' }
                : { color: 'rgba(255,255,255,0.38)' }
              }
            >
              {/* Active left-bar accent */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: '#0ABFA3' }}
                />
              )}

              <span className="flex items-center gap-3">
                <Icon
                  size={15}
                  className={`shrink-0 transition-colors duration-200 ${
                    active
                      ? 'text-brand'
                      : 'text-slate-600 group-hover:text-slate-300'
                  }`}
                />
                <span
                  className={`transition-colors duration-200 ${
                    active ? 'text-brand' : 'group-hover:text-white'
                  }`}
                >
                  {label}
                </span>
              </span>

              {badgeCount > 0 && (
                <span
                  className={`text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                    active ? 'bg-brand text-white' : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mx-5 mt-3 mb-3" style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

      {/* ── Sign out ───────────────────────────────────────────── */}
      <div className="px-3 pb-6">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
            style={{ color: 'rgba(255,255,255,0.28)' }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
