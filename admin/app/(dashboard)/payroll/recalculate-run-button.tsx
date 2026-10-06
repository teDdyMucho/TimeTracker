'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import ConfirmModal from '@/components/confirm-modal'
import { recalculatePayrollRunAction } from './actions'

/**
 * Refresh a pay run from the current approved attendance. A run is a snapshot
 * taken when it was generated, so hours approved afterwards are missing until
 * it is recalculated. Keeps the run and its links; only the figures change.
 */
export default function RecalculateRunButton({
  runId, entityName, period, status, synced,
}: {
  runId: string
  entityName: string
  period: string
  status: string
  synced: boolean
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [error, formAction, pending] = useActionState(recalculatePayrollRunAction, null)

  // Brief "Updated" flash once a recalculation finishes without an error.
  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      setDone(true)
      const t = setTimeout(() => setDone(false), 2500)
      return () => clearTimeout(t)
    }
    wasPending.current = pending
  }, [pending, error])

  if (synced) return null // pushed to Xero — figures are final; delete + re-create instead

  const extra = status === 'approved'
    ? ' This run is approved; recalculating sets it back to draft so the new figures can be checked and approved again.'
    : ''

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="id" value={runId} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          title="Recalculate from approved attendance"
          className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap disabled:opacity-60"
          style={{
            borderColor: done ? '#16A34A' : 'rgba(28,26,22,0.35)',
            color: done ? '#16A34A' : '#000000',
          }}
        >
          <RefreshCw size={12} className={pending ? 'animate-spin' : ''} />
          {pending ? 'Recalculating…' : done ? 'Updated' : 'Recalculate'}
        </button>
      </form>
      {error && (
        <span className="text-xs text-red-600 max-w-[220px] leading-tight" role="alert">{error}</span>
      )}

      <ConfirmModal
        open={open}
        icon={<RefreshCw size={24} style={{ color: '#1C1A16' }} />}
        title="Recalculate this pay run?"
        message={`${entityName} · ${period}. Hours and pay will be recomputed from all attendance that is approved right now — anything approved since this run was created will be added, and pending attendance stays excluded.${extra}`}
        confirmLabel="Recalculate"
        cancelLabel="Cancel"
        onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); formRef.current?.requestSubmit() }}
      />
    </>
  )
}
