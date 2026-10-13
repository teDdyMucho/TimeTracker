'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Timer, Banknote, AlertTriangle, Link2, UserX, Inbox } from 'lucide-react'
import { markInboxReadAction } from './inbox-actions'

export interface InboxItem {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  created_at: string
}

const ICONS: Record<string, { icon: typeof Bell; color: string; href: string }> = {
  payroll_ready:          { icon: Banknote,      color: '#1C1A16', href: '/payroll' },
  xero_sync_failed:       { icon: Link2,         color: '#DC2626', href: '/payroll' },
  labour_cost_threshold:  { icon: AlertTriangle, color: '#B45309', href: '/projects' },
  timesheet_missing_team: { icon: UserX,         color: '#B45309', href: '/attendance' },
  overtime:               { icon: Timer,         color: '#71717A', href: '/overtime' },
  leave:                  { icon: Timer,         color: '#71717A', href: '/leave' },
  message:                { icon: Inbox,         color: '#71717A', href: '/messages' },
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

/**
 * Admin notification bell: pending overtime count + the admin's own inbox rows
 * (payroll ready, Xero failures, budget alerts, missing timesheets …).
 */
export default function AdminInbox({ items, pendingCount }: { items: InboxItem[]; pendingCount: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [, startTransition] = useTransition()
  const unread = items.filter((i) => !i.read).length
  const badge = unread + (pendingCount > 0 ? 1 : 0)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) startTransition(() => { markInboxReadAction() })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative w-11 h-11 rounded-xl bg-white border border-[#ECEAE4] flex items-center justify-center hover:border-[#D8D3C8] transition-colors"
      >
        <Bell size={17} style={{ color: '#6B6660' }} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: '#EF4444' }}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-panel absolute right-0 mt-2 w-80 rounded-2xl overflow-hidden z-50 animate-fade-in">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="font-bold text-sm" style={{ color: '#18181B' }}>Notifications</span>
            {unread > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
                {unread} new
              </span>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {pendingCount > 0 && (
              <Link href="/overtime" onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 hover:bg-stone transition-colors border-b border-line">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F4F4F5' }}>
                  <Timer size={16} style={{ color: '#71717A' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#18181B' }}>
                    {pendingCount} overtime request{pendingCount > 1 ? 's' : ''} pending
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#71717A' }}>Tap to review and approve</p>
                </div>
              </Link>
            )}
            {items.length === 0 && pendingCount === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm" style={{ color: '#71717A' }}>You&rsquo;re all caught up 🎉</p>
              </div>
            ) : (
              items.map((n) => {
                const meta = ICONS[n.type] ?? { icon: Bell, color: '#71717A', href: '/' }
                const Icon = meta.icon
                return (
                  <Link key={n.id} href={meta.href} onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-stone transition-colors ${n.read ? '' : 'bg-[#FAF9F6]'}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F4F4F5' }}>
                      <Icon size={16} style={{ color: meta.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug" style={{ color: '#18181B' }}>{n.title}</p>
                      {n.body && <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: '#71717A' }}>{n.body}</p>}
                      <p className="text-[10px] mt-1" style={{ color: '#B4AEA3' }}>{relTime(n.created_at)}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#EF4444' }} />}
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
