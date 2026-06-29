'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Plus } from 'lucide-react'
import { createProjectAction } from './actions'
import { Input, Button } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import type { BusinessEntity } from '@/lib/types'

export default function NewProjectForm({ entities }: { entities: BusinessEntity[] }) {
  const [open, setOpen] = useState(false)
  const [serverError, formAction, pending] = useActionState(createProjectAction, null)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const [createdName, setCreatedName] = useState('')
  const [entityId, setEntityId] = useState(entities[0]?.id ?? '')
  const prevPendingRef = useRef(false)

  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      setStatus('success')
    }
    prevPendingRef.current = pending
  }, [pending, serverError])

  const handleClose = () => {
    setOpen(false)
    setStatus('idle')
    setCreatedName('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-brand text-white font-semibold rounded-xl px-4 py-2.5 text-sm hover:bg-brand-dark transition-colors"
      >
        <Plus size={16} />
        New project
      </button>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-sm text-center">
          <CheckCircle size={56} className="text-brand mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ink mb-2">Project created!</h2>
          <p className="text-muted text-sm mb-6">
            <strong className="text-ink">{createdName}</strong> has been added successfully.
          </p>
          <Button label="Done" className="w-full" onClick={handleClose} />
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-md my-auto">
        <h2 className="text-lg font-bold text-ink mb-5">New Project</h2>

        <form
          action={(fd) => {
            setCreatedName((fd.get('name') as string) ?? '')
            return formAction(fd)
          }}
          className="space-y-4"
        >
          {serverError && (
            <div className="flex items-start gap-2 bg-red-500/10 text-[#F87171] rounded-xl px-4 py-3 text-sm border border-red-500/20">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <Input
            label="Project name"
            name="name"
            required
            placeholder="Brisbane Renovation"
            disabled={pending}
          />
          <Input
            label="Client / builder"
            name="client"
            placeholder="Optional"
            disabled={pending}
          />
          <Input
            label="Code"
            name="code"
            placeholder="Optional reference code"
            disabled={pending}
          />
          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Business entity</span>
            <Dropdown
              name="business_entity_id"
              value={entityId}
              onChange={setEntityId}
              options={entities.map((e) => ({ value: e.id, label: e.name }))}
            />
          </div>

          <div className="flex gap-3 pt-2">
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
                'Create project'
              )}
            </button>
            <Button
              type="button"
              label="Cancel"
              variant="ghost"
              className="flex-1"
              onClick={handleClose}
              disabled={pending}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
