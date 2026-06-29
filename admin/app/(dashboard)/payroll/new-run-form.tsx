'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { generatePayrollAction } from './actions'
import { Input, Button } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import type { BusinessEntity } from '@/lib/types'

export default function NewPayrollRunForm({ entities }: { entities: BusinessEntity[] }) {
  const [open, setOpen] = useState(false)
  const [error, formAction, pending] = useActionState(generatePayrollAction, null)
  const [entityId, setEntityId] = useState(entities[0]?.id ?? '')
  const prevPending = useRef(false)

  // Close the modal once a run is created successfully
  useEffect(() => {
    if (prevPending.current && !pending && !error) setOpen(false)
    prevPending.current = pending
  }, [pending, error])

  // Default period: fortnightly ending today (Brisbane)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const twoWeeksAgo = new Date(Date.now() - 13 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })

  return (
    <>
      <Button label="+ New pay run" onClick={() => setOpen(true)} />
      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-ink mb-1">Generate Pay Run</h2>
            <p className="text-muted text-sm mb-5">
              Aggregates each employee&rsquo;s submitted hours for the period into pay bands
              (ordinary, overtime, weekend, public holiday) — ready to export to Xero.
            </p>
            <form action={formAction} className="space-y-4">
              {error && (
                <div className="bg-white text-[#F87171] rounded-xl px-4 py-3 text-sm border border-line">{error}</div>
              )}
              <div>
                <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Business entity</span>
                <Dropdown
                  name="business_entity_id"
                  value={entityId}
                  onChange={setEntityId}
                  options={entities.map((e) => ({ value: e.id, label: e.name }))}
                />
              </div>
              <Input label="Period start" name="period_start" type="date" required defaultValue={twoWeeksAgo} />
              <Input label="Period end" name="period_end" type="date" required defaultValue={today} />
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  label={pending ? 'Creating…' : 'Create pay run'}
                  disabled={pending}
                  className="flex-1"
                />
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
      )}
    </>
  )
}
