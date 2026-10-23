'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Plus, XCircle, Loader2 } from 'lucide-react'
import { addHolidayAction } from './actions'
import { Input, Button } from '@/components/ui'

export default function HolidayForm() {
  const [open, setOpen] = useState(false)
  const [error, formAction, pending] = useActionState(addHolidayAction, null)
  const prevPending = useRef(false)

  useEffect(() => {
    if (prevPending.current && !pending && !error) setOpen(false)
    prevPending.current = pending
  }, [pending, error])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-brand text-white font-semibold rounded-xl px-4 py-2.5 text-sm hover:bg-brand-dark transition-colors"
      >
        <Plus size={16} />
        Add holiday
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-md my-auto">
        <h2 className="text-lg font-bold text-ink mb-1">Add public holiday</h2>
        <p className="text-muted text-sm mb-5">
          Hours worked on this date are paid at the public-holiday rate for every entity.
        </p>
        <form action={formAction} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <Input label="Date" name="date" type="date" required disabled={pending} />
          <Input label="Name" name="name" required placeholder="e.g. Melbourne Cup Day" disabled={pending} />
          <Input label="Region (optional)" name="region" placeholder="e.g. VIC, QLD or leave blank for national" disabled={pending} />
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl py-2.5 text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {pending ? (<><Loader2 size={16} className="animate-spin" /> Saving…</>) : 'Add holiday'}
            </button>
            <Button type="button" label="Cancel" variant="ghost" className="flex-1" onClick={() => setOpen(false)} disabled={pending} />
          </div>
        </form>
      </div>
    </div>
  )
}
