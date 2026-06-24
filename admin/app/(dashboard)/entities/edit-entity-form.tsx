'use client'
import { useActionState, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Loader2, X } from 'lucide-react'
import { updateEntityAction } from './actions'
import { Input, Button } from '@/components/ui'

interface Entity {
  id: string
  name: string
  xero_tenant_id: string | null
}

export default function EditEntityForm({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  const [serverError, formAction, pending] = useActionState(updateEntityAction, null)
  const prevPendingRef = useRef(false)

  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      onClose()
    }
    prevPendingRef.current = pending
  }, [pending, serverError, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-ink">Edit Entity</h2>
            <p className="text-sm text-muted mt-0.5">Update business entity details</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form
          action={(fd) => {
            fd.set('id', entity.id)
            return formAction(fd)
          }}
          className="px-7 py-6 space-y-4"
        >
          {serverError && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <Input
            label="Entity name"
            name="name"
            required
            defaultValue={entity.name}
            placeholder="e.g. Build One"
            disabled={pending}
          />

          <Input
            label="Xero Tenant ID (optional)"
            name="xero_tenant_id"
            defaultValue={entity.xero_tenant_id ?? ''}
            placeholder="Leave blank if not connected"
            disabled={pending}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #9A7A4E, #836439)' }}
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
            <Button
              type="button"
              label="Cancel"
              variant="ghost"
              className="flex-1"
              onClick={onClose}
              disabled={pending}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
