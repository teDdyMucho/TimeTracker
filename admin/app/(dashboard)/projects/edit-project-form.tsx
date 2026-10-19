'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { XCircle, Loader2, X } from 'lucide-react'
import { updateProjectAction } from './actions'
import { Button } from '@/components/ui'
import ProjectFields, { type ProjectFormValues } from './project-fields'
import type { BusinessEntity } from '@/lib/types'

export default function EditProjectForm({
  project,
  entities,
  onClose,
}: {
  project: ProjectFormValues & { id: string; budget_is_default?: boolean }
  entities: BusinessEntity[]
  onClose: () => void
}) {
  const [serverError, formAction, pending] = useActionState(updateProjectAction, null)
  const [entityId, setEntityId] = useState(project.business_entity_id ?? entities[0]?.id ?? '')
  const prevPending = useRef(false)

  useEffect(() => {
    if (prevPending.current && !pending && !serverError) onClose()
    prevPending.current = pending
  }, [pending, serverError, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto"
      style={{ background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="glass-panel rounded-3xl w-full max-w-md animate-scale-in my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-ink">Edit Project</h2>
            <p className="text-sm text-muted mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone text-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <form
          action={(fd) => { fd.set('id', project.id); return formAction(fd) }}
          className="px-7 py-6 space-y-4"
        >
          {serverError && (
            <div className="flex items-start gap-2 text-[#F87171] rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <XCircle size={16} className="shrink-0 mt-0.5" /> {serverError}
            </div>
          )}
          <ProjectFields
            values={project.budget_is_default ? { ...project, budget_labour_cost: null } : project}
            entities={entities}
            entityId={entityId}
            onEntityChange={setEntityId}
            pending={pending}
          />
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#1C1A16', color: '#fff' }}
            >
              {pending ? (<><Loader2 size={16} className="animate-spin" /> Saving…</>) : 'Save changes'}
            </button>
            <Button type="button" label="Cancel" variant="ghost" className="flex-1" onClick={onClose} disabled={pending} />
          </div>
        </form>
      </div>
    </div>
  )
}
