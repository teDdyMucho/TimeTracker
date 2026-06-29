'use client'
import { useEffect, useState, useTransition } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { approveOvertimeAction, rejectOvertimeAction } from './actions'
import { formatHours } from '@/lib/format'

interface OvertimeRequest {
  id: string
  reason: string
  status: string
  timesheet_id: string
  created_at: string
  profiles?: { name?: string; email?: string }
  timesheets?: { work_date?: string; hours?: number; work_location?: string; projects?: { name?: string } }
}

interface Modal {
  type: 'success' | 'error'
  message: string
}

export default function OvertimeClient({
  pending: initialPending,
  recent,
  view = 'pending',
}: {
  pending: OvertimeRequest[]
  recent: any[]
  view?: 'pending' | 'reviewed'
}) {
  const [isPending, startTransition] = useTransition()
  const [actingOn, setActingOn] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [modal, setModal] = useState<Modal | null>(null)
  const [pending, setPending] = useState<OvertimeRequest[]>(initialPending)

  // Keep local list in sync when the server re-renders with new props (e.g. filters change).
  useEffect(() => { setPending(initialPending) }, [initialPending])

  const handleAction = (id: string, timesheetId: string, action: 'approve' | 'reject') => {
    if (isPending) return
    setActingOn({ id, action })
    const formData = new FormData()
    formData.append('id', id)
    formData.append('timesheet_id', timesheetId)
    startTransition(async () => {
      try {
        if (action === 'approve') {
          await approveOvertimeAction(formData)
        } else {
          await rejectOvertimeAction(formData)
        }
        setPending((prev) => prev.filter((r) => r.id !== id))
        setModal({
          type: 'success',
          message: action === 'approve' ? 'Overtime request approved.' : 'Overtime request rejected.',
        })
      } catch (err) {
        setModal({
          type: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        })
      } finally {
        setActingOn(null)
      }
    })
  }

  return (
    <>
      {/* Pending view */}
      {view === 'pending' && (
      pending.length > 0 ? (
        <div className="space-y-3 mb-10">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Awaiting review
          </h2>
          {pending.map((req) => {
            const ts = req.timesheets
            const isActing = actingOn?.id === req.id
            return (
              <Card key={req.id} className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-ink">{req.profiles?.name}</span>
                    <span className="text-muted text-sm">{req.profiles?.email}</span>
                  </div>
                  <div className="text-sm text-muted mb-2">
                    {ts?.work_date} &middot; {formatHours(ts?.hours)} &middot; {ts?.work_location} &middot; {ts?.projects?.name}
                  </div>
                  <div className="text-sm text-ink bg-slate-50 rounded-lg px-3 py-2">
                    &ldquo;{req.reason}&rdquo;
                  </div>
                </div>
                <div className="flex gap-2 sm:flex-col shrink-0">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAction(req.id, req.timesheet_id, 'approve')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand-dark active:scale-95 transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
                  >
                    {isActing && actingOn?.action === 'approve' ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAction(req.id, req.timesheet_id, 'reject')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
                  >
                    {isActing && actingOn?.action === 'reject' ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                      <XCircle size={14} />
                    )}
                    Reject
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="mb-10">
          <p className="text-muted text-sm py-4 text-center">No pending overtime requests.</p>
        </Card>
      )
      )}

      {/* Reviewed view */}
      {view === 'reviewed' && (
        recent && recent.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Recently reviewed
          </h2>
          <Card>
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  {['Employee', 'Date', 'Project', 'Hours', 'Reason', 'Decision', 'Reviewed'].map((h) => (
                    <th key={h} className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recent.map((req: any) => (
                  <tr key={req.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 pr-4 font-medium whitespace-nowrap">{req.profiles?.name}</td>
                    <td className="py-3 pr-4 text-muted whitespace-nowrap">{req.timesheets?.work_date}</td>
                    <td className="py-3 pr-4 text-ink whitespace-nowrap">{req.timesheets?.projects?.name ?? '—'}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatHours(req.timesheets?.hours)}</td>
                    <td className="py-3 pr-4 text-muted max-w-[260px]">
                      {req.reason ? (
                        <span className="italic">&ldquo;{req.reason}&rdquo;</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4"><Badge status={req.status} /></td>
                    <td className="py-3 text-muted whitespace-nowrap">
                      {req.decided_at
                        ? new Date(req.decided_at).toLocaleDateString('en-AU')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        </div>
        ) : (
          <Card>
            <p className="text-muted text-sm py-4 text-center">No reviewed overtime requests for this filter.</p>
          </Card>
        )
      )}

      {/* Success / Error Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setModal(null)}
        >
          <div
            className="rounded-3xl p-8 w-full max-w-sm text-center animate-scale-in border"
            style={{ background: '#FFFFFF', borderColor: '#E4E4E7', boxShadow: '0 24px 64px -12px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {modal.type === 'success' ? (
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-brand" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
            )}
            <h3 className="text-lg font-bold text-ink mb-2">
              {modal.type === 'success' ? 'Done!' : 'Something went wrong'}
            </h3>
            <p className="text-sm mb-6" style={{ color: '#71717A' }}>{modal.message}</p>
            <button
              onClick={() => setModal(null)}
              className="w-full font-semibold rounded-xl py-2.5 text-sm transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#1C1A16', color: '#fff' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
