'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import Sidebar from './sidebar'

interface Props {
  pendingOvertimeCount: number
  userName: string
  userEmail: string
  children: React.ReactNode
}

export default function AppShell({ pendingOvertimeCount, userName, userEmail, children }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F7F6F2' }}>

      {/* Backdrop (mobile only, when drawer open) */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Sidebar — static on large screens, slide-in drawer on small */}
      <div
        className={`fixed inset-y-0 left-0 z-50 shrink-0 transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          pendingOvertimeCount={pendingOvertimeCount}
          userName={userName}
          userEmail={userEmail}
        />
      </div>

      {/* Main column */}
      <main className="flex-1 overflow-auto min-w-0" style={{ background: '#F7F6F2' }}>

        {/* Mobile top bar with hamburger — matches the dark sidebar */}
        <div
          className="lg:hidden sticky top-0 z-30 relative flex items-center px-4 h-14"
          style={{ background: '#1C1A16', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="relative z-10 p-2 -ml-2 rounded-lg transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Menu size={22} className="text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/buildone.png?v=2"
            alt="BuildOne"
            className="absolute left-1/2 -translate-x-1/2 h-6 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>

        <div className="p-4 sm:p-6 lg:p-8 min-h-full animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
