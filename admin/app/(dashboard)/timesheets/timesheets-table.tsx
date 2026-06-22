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
            <tr className="text-left border-b border-slate-100">
              {['Employee', 'Date', 'Project', 'Location', 'Hours', 'Status', 'Actions'].map((h) => (
                <th key={h} className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((t) => {
              const isActing = actingOn?.id === t.id
              return (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium">{t.profiles?.name ?? '—'}</td>
                  <td className="py-3 pr-4 text-muted">{t.work_date}</td>
                  <td className="py-3 pr-4 text-muted max-w-[160px] truncate">{t.projects?.name ?? '—'}</td>
                  <td className="py-3 pr-4 capitalize text-muted">{t.work_location}</td>
                  <td className="py-3 pr-4 font-semibold">{Number(t.hours)} h</td>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
            {modal.type === 'success' ? (
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
            ) : (
              <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
            )}
            <h3 className="text-lg font-bold text-ink mb-2">
              {modal.type === 'success' ? 'Done!' : 'Something went wrong'}
            </h3>
            <p className="text-muted text-sm mb-6">{modal.message}</p>
            <button
              onClick={() => setModal(null)}
              className="w-full bg-brand text-white font-semibold rounded-xl py-2.5 hover:bg-teal-500 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
