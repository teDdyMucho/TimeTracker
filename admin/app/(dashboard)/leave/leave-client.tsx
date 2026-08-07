'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { CheckCircle, XCircle, CalendarDays } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { approveLeaveAction, rejectLeaveAction } from './actions'

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  personal: 'Personal Leave',
  unpaid: 'Unpaid Leave',
}

interface LeaveRequest {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
  status: string
  created_at?: string
  decided_at?: string
  profile?: { name?: string; email?: string } | null
}

function fmtRange(start: string, end: string) {
  const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return start === end ? f(start) : `${f(start)} – ${f(end)}`
}

function days(start: string, end: string) {
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.round(ms / 86_400_000) + 1
}

export default function LeaveClient({
  pending: initialPending,
  recent,
  view = 'pending',
}: {
  pending: LeaveRequest[]
  recent: LeaveRequest[]
  view?: 'pending' | 'reviewed'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [actingOn, setActingOn] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [modal, setModal] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pending, setPending] = useState<LeaveRequest[]>(initialPending)

  useEffect(() => { setPending(initialPending) }, [initialPending])

  function setView(v: 'pending' | 'reviewed') {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'reviewed') params.set('view', 'reviewed')
    else params.delete('view')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    if (isPending) return
    setActingOn({ id, action })
    const fd = new FormData()
    fd.append('id', id)
    startTransition(async () => {
      try {
        if (action === 'approve') await approveLeaveAction(fd)
        else await rejectLeaveAction(fd)
        setPending((prev) => prev.filter((r) => r.id !== id))
        setModal({ type: 'success', message: action === 'approve' ? 'Leave request approved.' : 'Leave request rejected.' })
      } catch (err) {
        setModal({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' })
      } finally {
        setActingOn(null)
      }
    })
  }

  const tab = 'px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 hover:opacity-90'
  const activeStyle = { background: '#1C1A16', color: '#fff', borderColor: '#1C1A16' }
  const idleStyle = { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }

  return (
    <>
      {/* Pending / Reviewed toggle */}
      <div className="flex gap-2 mb-5">
        <button type="button" onClick={() => setView('pending')} className={`${tab} border`} style={view === 'pending' ? activeStyle : idleStyle}>
          Pending ({pending.length})
        </button>
        <button type="button" onClick={() => setView('reviewed')} className={`${tab} border`} style={view === 'reviewed' ? activeStyle : idleStyle}>
          Reviewed ({recent.length})
        </button>
      </div>

      {/* Pending */}
      {view === 'pending' && (
        pending.length > 0 ? (
          <div className="space-y-3">
            {pending.map((req) => {
              const isActing = actingOn?.id === req.id
              return (
                <Card key={req.id} className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-ink">{req.profile?.name ?? 'Employee'}</span>
                      <span className="text-muted text-sm">{req.profile?.email}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-0.5" style={{ background: 'rgba(28,26,22,0.08)', color: '#1C1A16' }}>
                        <CalendarDays size={12} /> {LEAVE_LABELS[req.leave_type] ?? req.leave_type}
                      </span>
                    </div>
                    <div className="text-sm text-muted mb-2">
                      {fmtRange(req.start_date, req.end_date)} · {days(req.start_date, req.end_date)} day{days(req.start_date, req.end_date) !== 1 ? 's' : ''}
                    </div>
                    {req.reason ? (
                      <div className="text-sm text-ink bg-slate-50 rounded-lg px-3 py-2">&ldquo;{req.reason}&rdquo;</div>
                    ) : null}
                  </div>
                  <div className="flex gap-2 sm:flex-col shrink-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleAction(req.id, 'approve')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand-dark active:scale-95 transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {isActing && actingOn?.action === 'approve' ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      ) : <CheckCircle size={14} />}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleAction(req.id, 'reject')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {isActing && actingOn?.action === 'reject' ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      ) : <XCircle size={14} />}
                      Reject
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card><p className="text-muted text-sm py-4 text-center">No pending leave requests.</p></Card>
        )
      )}

      {/* Reviewed */}
      {view === 'reviewed' && (
        recent.length > 0 ? (
          <Card>
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  {['Employee', 'Type', 'Dates', 'Days', 'Reason', 'Decision', 'Reviewed'].map((h) => (
                    <th key={h} className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recent.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 pr-4 font-medium whitespace-nowrap">{req.profile?.name ?? '—'}</td>
                    <td className="py-3 pr-4 text-ink whitespace-nowrap">{LEAVE_LABELS[req.leave_type] ?? req.leave_type}</td>
                    <td className="py-3 pr-4 text-muted whitespace-nowrap">{fmtRange(req.start_date, req.end_date)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{days(req.start_date, req.end_date)}</td>
                    <td className="py-3 pr-4 text-muted max-w-[240px]">
                      {req.reason ? <span className="italic">&ldquo;{req.reason}&rdquo;</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 pr-4"><Badge status={req.status} /></td>
                    <td className="py-3 text-muted whitespace-nowrap">
                      {req.decided_at ? new Date(req.decided_at).toLocaleDateString('en-AU') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        ) : (
          <Card><p className="text-muted text-sm py-4 text-center">No reviewed leave requests yet.</p></Card>
        )
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setModal(null)}>
          <div className="rounded-3xl p-8 w-full max-w-sm text-center animate-scale-in border" style={{ background: '#FFFFFF', borderColor: '#E4E4E7', boxShadow: '0 24px 64px -12px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
            {modal.type === 'success' ? (
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-5"><CheckCircle className="w-8 h-8 text-brand" /></div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5"><XCircle className="w-8 h-8 text-red-400" /></div>
            )}
            <h3 className="text-lg font-bold text-ink mb-2">{modal.type === 'success' ? 'Done!' : 'Something went wrong'}</h3>
            <p className="text-sm mb-6" style={{ color: '#71717A' }}>{modal.message}</p>
            <button onClick={() => setModal(null)} className="w-full font-semibold rounded-xl py-2.5 text-sm transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: '#1C1A16', color: '#fff' }}>OK</button>
          </div>
        </div>
      )}
    </>
  )
}
