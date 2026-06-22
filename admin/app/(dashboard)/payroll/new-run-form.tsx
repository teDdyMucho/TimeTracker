'use client'
import { useActionState, useState } from 'react'
import { generatePayrollAction } from './actions'
import { Input, Select, Button } from '@/components/ui'
import type { BusinessEntity } from '@/lib/types'

export default function NewPayrollRunForm({ entities }: { entities: BusinessEntity[] }) {
  const [open, setOpen] = useState(false)
  const [error, formAction, pending] = useActionState(generatePayrollAction, null)

  // Default period: fortnightly ending today
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const twoWeeksAgo = new Date(Date.now() - 13 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })

  return (
    <>
      <Button label="+ New pay run" onClick={() => setOpen(true)} />
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-ink mb-1">Generate Pay Run</h2>
            <p className="text-muted text-sm mb-5">
              Creates a draft payroll run. Labour costs are calculated by the Edge Function after
              pay rates are configured.
            </p>
            <form action={formAction} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
              )}
              <Select label="Business entity" name="business_entity_id" required>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </Select>
              <Input
                label="Period start"
                name="period_start"
                type="date"
                required
                defaultValue={twoWeeksAgo}
              />
              <Input
                label="Period end"
                name="period_end"
                type="date"
                required
                defaultValue={today}
              />
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  label={pending ? 'Creating…' : 'Create draft'}
                  disabled={pending}
                  className="flex-1"
                />
                <Button
                  type="button"
                  label="Cancel"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setOpen(false)}
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
