'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Plus } from 'lucide-react'
import { createEntityAction } from './actions'
import { Input, Button } from '@/components/ui'

export default function NewEntityForm() {
  const [open, setOpen] = useState(false)
  const [serverError, formAction, pending] = useActionState(createEntityAction, null)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const [createdName, setCreatedName] = useState('')
  const prevPendingRef = useRef(false)

  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      setStatus('success')
    }
    prevPendingRef.current = pending
  }, [pending, serverError])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-brand text-white font-semibold rounded-xl px-4 py-2.5 text-sm hover:bg-brand-dark transition-colors"
      >
        <Plus size={16} />
        Add entity
      </button>
    )
  }

  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-sm text-center">
          <CheckCircle size={56} className="text-brand mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ink mb-2">Entity created!</h2>
          <p className="text-muted text-sm mb-6">
            <strong className="text-ink">{createdName}</strong> has been added.
          </p>
          <Button
            label="Done"
            className="w-full bg-white text-black hover:bg-[#E5E5E5]"
            onClick={() => {
              setStatus('idle')
              setOpen(false)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-ink mb-5">Add Business Entity</h2>

        <form
          action={(fd) => {
            setCreatedName((fd.get('name') as string) ?? '')
            return formAction(fd)
          }}
          className="space-y-4"
        >
          {serverError && (
            <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.12)] text-[#F87171] rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <Input
            label="Entity name"
            name="name"
            required
            placeholder="e.g. Build One"
            disabled={pending}
            className="bg-white text-ink border-line placeholder-faint"
          />

          <p className="text-xs text-muted">
            Overtime rates and pay config use standard defaults (OT 1.5×/2×, Sat 1.5×, Sun 2×, PH 2.5×). These can be adjusted later.
          </p>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl py-2.5 text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating…
                </>
              ) : (
                'Create entity'
              )}
            </button>
            <Button
              type="button"
              label="Cancel"
              variant="ghost"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={pending}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
