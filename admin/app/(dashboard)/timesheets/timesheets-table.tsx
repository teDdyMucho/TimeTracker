'use client'
import { useState, useTransition } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { formatHours } from '@/lib/format'
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
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100">
              {['Employee', 'Date', 'Project', 'Location', 'Hours', 'Status', 'Actions'].map((h) => (
                <th key={h} className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((t) => {
              const isActing = actingOn?.id === t.id
              return (
                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-ink">{t.profiles?.name ?? 'â€”'}</td>
                  <td className="py-3 pr-4 text-muted text-xs font-medium">{t.work_date}</td>
                  <td className="py-3 pr-4 text-muted max-w-[160px] truncate">{t.projects?.name ?? 'â€”'}</td>
                  <td className="py-3 pr-4 capitalize text-muted text-xs">{t.work_location}</td>
                  <td className="py-3 pr-4 font-bold text-ink">{formatHours(t.hours)}</td>
                  <td className="py-3 pr-4">
                    <Badge status={t.overtime_status !== 'none' ? t.overtime_status : t.status} />
                  </td>
                  <td className="py-3">
                    {t.status === 'submitted' && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAction(t.id, 'approve')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand text-white hover:bg-brand-dark active:scale-95 transition-all shadow-sm disabled:opacity-50"
                        >
                          {isActing && actingOn?.action === 'approve' ? (
                            <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                          ) : (
                            <CheckCircle size={12} />
                          )}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAction(t.id, 'reject')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all shadow-sm disabled:opacity-50"
                        >
                          {isActing && actingOn?.action === 'reject' ? (
                            <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                          ) : (
                            <XCircle size={12} />
                          )}
                          Reject
                        </button>
                      </div>
                    )}
                    {t.status === 'approved' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand/10 text-brand border border-brand/20">
                        <CheckCircle size={12} /> Approved
                      </span>
                    )}
                    {t.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-100">
                        <XCircle size={12} /> Rejected
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
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
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-brand" />
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
              style={{ background: 'linear-gradient(135deg, #9A7A4E, #836439)' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
