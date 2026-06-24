'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Bell, ChevronDown, LogOut, Timer } from 'lucide-react'
import { signOutAction } from '@/app/actions'

export default function HeaderActions({
  userName,
  userEmail,
  pendingCount,
}: {
  userName: string
  userEmail: string
  pendingCount: number
}) {
  const [openBell, setOpenBell] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpenBell(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setOpenUser(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpenBell(false); setOpenUser(false) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  return (
    <div className="flex items-center gap-3">

      {/* ── Notifications ──────────────────────────────────── */}
      <div className="relative" ref={bellRef}>
        <button
          type="button"
          onClick={() => { setOpenBell((v) => !v); setOpenUser(false) }}
          className="relative w-11 h-11 rounded-xl bg-white border border-[#ECEAE4] flex items-center justify-center hover:border-[#D8D3C8] transition-colors"
        >
          <Bell size={17} style={{ color: '#6B6660' }} />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: '#EF4444' }}>
              {pendingCount}
            </span>
          )}
        </button>

        {openBell && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-[#ECEAE4] shadow-card-hover overflow-hidden z-50 animate-fade-in">
            <div className="px-4 py-3 border-b border-[#ECEAE4] flex items-center justify-between">
              <span className="font-bold text-sm" style={{ color: '#2D2A26' }}>Notifications</span>
              {pendingCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#EF4444' }}>
                  {pendingCount} new
                </span>
              )}
            </div>
            {pendingCount > 0 ? (
              <Link href="/overtime" onClick={() => setOpenBell(false)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-[#FAF9F6] transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#FCF3E2' }}>
                  <Timer size={16} style={{ color: '#F5B33E' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#2D2A26' }}>
                    {pendingCount} overtime request{pendingCount > 1 ? 's' : ''} pending
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8A857C' }}>Tap to review and approve</p>
                </div>
              </Link>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm" style={{ color: '#8A857C' }}>You&rsquo;re all caught up 🎉</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── User menu ──────────────────────────────────────── */}
      <div className="relative" ref={userRef}>
        <button
          type="button"
          onClick={() => { setOpenUser((v) => !v); setOpenBell(false) }}
          className="flex items-center gap-2 pl-1"
        >
          <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favcon.png" alt="BuildOne" className="w-full h-full object-contain scale-[1.9]" />
          </div>
          <ChevronDown size={15} style={{ color: '#B4AEA3' }}
            className={`transition-transform ${openUser ? 'rotate-180' : ''}`} />
        </button>

        {openUser && (
          <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-[#ECEAE4] shadow-card-hover overflow-hidden z-50 animate-fade-in">
            <div className="px-4 py-3 border-b border-[#ECEAE4]">
              <p className="text-sm font-bold truncate" style={{ color: '#2D2A26' }}>{userName}</p>
              <p className="text-xs truncate" style={{ color: '#8A857C' }}>{userEmail || 'Administrator'}</p>
            </div>
            <form action={signOutAction}>
              <button type="submit"
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-[#FEF2F2] transition-colors"
                style={{ color: '#EF4444' }}>
                <LogOut size={16} />
                Log out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
