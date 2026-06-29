'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { updateEmployeeAction } from './actions'
import { Button, Input } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import type { BusinessEntity } from '@/lib/types'

interface Props {
  employee: {
    id: string
    name: string
    role: string
    employment_type: string
    business_access: string[]
    hourly_rate?: number | null
  }
  entities: BusinessEntity[]
  onClose: () => void
}

export default function EditEmployeeForm({ employee, entities, onClose }: Props) {
  const [serverError, formAction, pending] = useActionState(updateEmployeeAction, null)
  const [selectedEntities, setSelectedEntities] = useState<string[]>(employee.business_access)
  const [role, setRole] = useState(employee.role)
  const [employmentType, setEmploymentType] = useState(employee.employment_type)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const prevPendingRef = useRef(false)

  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      setStatus('success')
    }
    prevPendingRef.current = pending
  }, [pending, serverError])

  const toggleEntity = (id: string) =>
    setSelectedEntities((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )

  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-sm text-center">
          <CheckCircle size={56} className="text-brand mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ink mb-2">Employee updated!</h2>
          <p className="text-muted text-sm mb-6">
            <strong className="text-ink">{employee.name}</strong> has been updated successfully.
          </p>
          <Button label="Done" className="w-full" onClick={onClose} />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-ink mb-1">Edit Employee</h2>
        <p className="text-muted text-sm mb-5">{employee.name}</p>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={employee.id} />

          {serverError && (
            <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.12)] text-[#F87171] rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Role</span>
            <Dropdown
              name="role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'employee', label: 'Employee' },
                { value: 'supervisor', label: 'Supervisor' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Employment type</span>
            <Dropdown
              name="employment_type"
              value={employmentType}
              onChange={setEmploymentType}
              options={[
                { value: 'full_time', label: 'Full time' },
                { value: 'part_time', label: 'Part time' },
                { value: 'casual', label: 'Casual' },
                { value: 'contractor', label: 'Contractor' },
              ]}
            />
          </div>

          <Input
            label="Hourly pay rate ($)"
            name="hourly_rate"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="e.g. 45.00"
            defaultValue={employee.hourly_rate != null ? String(employee.hourly_rate) : ''}
            disabled={pending}
          />

          <div>
            <span className="block text-sm font-medium text-ink mb-2">Entity access</span>
            <div className="flex flex-wrap gap-3">
              {entities.map((e) => (
                <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="entity_ids"
                    value={e.id}
                    checked={selectedEntities.includes(e.id)}
                    onChange={() => toggleEntity(e.id)}
                    disabled={pending}
                    className="rounded accent-brand w-4 h-4"
                  />
                  <span className="text-sm text-ink">{e.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl py-2.5 text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
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
