'use client'
import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import ConfirmModal from '@/components/confirm-modal'
import { deletePayrollRunAction } from './actions'

/**
 * Delete a pay run, behind a confirmation. Deleting is permanent and removes
 * every employee's figures for that period, so the dialog names the period and
 * warns when the run has already been approved or pushed to Xero.
 */
export default function DeleteRunButton({
  runId, entityName, period, employeeCount, status, synced,
}: {
  runId: string
  entityName: string
  period: string
  employeeCount: number
  status: string
  synced: boolean
}) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const extra = synced
    ? ' This run has already been pushed to Xero — deleting it here will not remove it from Xero.'
    : status === 'approved'
      ? ' This run has already been approved.'
      : ''

  return (
    <>
      <form ref={formRef} action={deletePayrollRunAction}>
        <input type="hidden" name="id" value={runId} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Delete pay run"
          aria-label="Delete pay run"
          className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </form>

      <ConfirmModal
        open={open}
        destructive
        icon={<Trash2 size={24} style={{ color: '#DC2626' }} />}
        title="Delete this pay run?"
        message={`${entityName} · ${period} — ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. This permanently removes the calculated hours and pay for everyone in this run. It cannot be undone.${extra}`}
        confirmLabel="Delete pay run"
        cancelLabel="Keep it"
        onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); formRef.current?.requestSubmit() }}
      />
    </>
  )
}
