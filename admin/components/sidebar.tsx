'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertCircle,
  BarChart3,
  Building2,
  Clock,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MapPin,
  Users,
} from 'lucide-react'
import { signOutAction } from '@/app/actions'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/entities', label: 'Entities', icon: Building2 },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/attendance', label: 'Attendance', icon: MapPin },
  { href: '/timesheets', label: 'Timesheets', icon: Clock },
  { href: '/overtime', label: 'Overtime', icon: AlertCircle, badge: true },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/payroll', label: 'Payroll', icon: CreditCard },
]

export default function Sidebar({ pendingOvertimeCount }: { pendingOvertimeCount: number }) {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-slate-900 flex flex-col h-full shrink-0">
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="text-2xl font-bold text-brand">Timevera</div>
        <div className="text-slate-400 text-xs mt-0.5 tracking-wide uppercase">Admin Portal</div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const badgeCount = badge ? pendingOvertimeCount : 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors group ${
                active
                  ? 'bg-brand text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon size={17} />
                <span className="text-sm font-medium">{label}</span>
              </span>
              {badgeCount > 0 && (
                <span
                  className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                    active ? 'bg-white text-brand' : 'bg-amber-500 text-white'
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors w-full"
          >
            <LogOut size={17} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
