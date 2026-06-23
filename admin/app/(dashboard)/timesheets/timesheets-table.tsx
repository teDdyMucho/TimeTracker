'use client'
import { useState, useTransition } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { approveTimesheetAction, rejectTimesheetAction } from './actions'

interface Timesheet {
  id: string
  work_date: string
  hours: number
  work_location: string
  overtime_status: string
  status: string
  profiles?: { name?: string }
  projects?: { name?: string }
}

interface Modal {
  type: 'success' | 'error'
  message: string
}

export default function TimesheetsTable({ timesheets }: { timesheets: Timesheet[] }) {
  const [isPending, startTransition] = useTransition()
  const [actingOn, setActingOn] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [modal, setModal] = useState<Modal | null>(null)
  const [rows, setRows] = useState<Timesheet[]>(timesheets)

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    if (isPending) return
    setActingOn({ id, action })
    const formData = new FormData()
    formData.append('id', id)
    startTransition(async () => {
      const error =
        action === 'approve'
          ? await approveTimesheetAction(null, formData)
          : await rejectTimesheetAction(null, formData)
      setActingOn(null)
      if (error) {
        setModal({ type: 'error', message: error })
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r,
          ),
        )
        setModal({
          type: 'success',
          message: action === 'approve' ? 'Timesheet approved successfully.' : 'Timesheet rejected.',
        })
      }
    })
  }

  return (
    <>
      {rows.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">No timesheets found for this filter.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {['Employee', 'Date', 'Project', 'Location', 'Hours', 'Status', 'Actions'].map((h) => (
                <th key={h} className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((t) => {
              const isActing = actingOn?.id === t.id
              return (
                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-ink">{t.profiles?.name ?? '—'}</td>
                  <td className="py-3 pr-4 text-muted text-xs font-medium">{t.work_date}</td>
                  <td className="py-3 pr-4 text-muted max-w-[160px] truncate">{t.projects?.name ?? '—'}</td>
                  <td className="py-3 pr-4 capitalize text-muted text-xs">{t.work_location}</td>
                  <td className="py-3 pr-4 font-bold text-ink">{Number(t.hours)} h</td>
                  <td className="py-3 pr-4">
                    <Badge status={t.overtime_status !== 'none' ? t.overtime_status : t.status} />
                  </td>
                  <td className="py-3">
                    {t.status === 'submitted' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAction(t.id, 'approve')}
                          className="text-xs px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {isActing && actingOn?.action === 'approve' ? (
                            <span className="w-3 h-3 border-2 border-green-700 border-t-transparent rounded-full animate-spin inline-block" />
                          ) : null}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAction(t.id, 'reject')}
                          className="text-xs px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {isActing && actingOn?.action === 'reject' ? (
                            <span className="w-3 h-3 border-2 border-red-700 border-t-transparent rounded-full animate-spin inline-block" />
                          ) : null}
                          Reject
                        </button>
                      </div>
                    )}
                    {t.status === 'approved' && (
                      <span className="text-xs text-green-600 font-medium">✓ Approved</span>
                    )}
                    {t.status === 'rejected' && (
                      <span className="text-xs text-red-500 font-medium">✗ Rejected</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Success / Error Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-3xl p-8 w-full max-w-sm text-center animate-scale-in"
            style={{ boxShadow: '0 24px 64px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {modal.type === 'success' ? (
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            )}
            <h3 className="text-lg font-bold text-ink mb-2">
              {modal.type === 'success' ? 'Done!' : 'Something went wrong'}
            </h3>
            <p className="text-muted text-sm mb-6">{modal.message}</p>
            <button
              onClick={() => setModal(null)}
              className="w-full text-white font-semibold rounded-xl py-2.5 text-sm transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ABFA3, #089E87)' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
