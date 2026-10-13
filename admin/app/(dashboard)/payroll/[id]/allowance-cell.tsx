'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { setAllowanceAction } from '../actions'

const money = (n: number) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

/** Inline editor for an employee's allowances on a pay run (PRD §15). */
export default function AllowanceCell({
  runId,
  profileId,
  value,
  locked,
}: {
  runId: string
  profileId: string
  value: number
  locked: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [error, formAction, pending] = useActionState(setAllowanceAction, null)
  const prevPending = useRef(false)

  useEffect(() => {
    if (prevPending.current && !pending && !error) setEditing(false)
    prevPending.current = pending
  }, [pending, error])

  if (locked) return <span className="tabular-nums text-muted">{value > 0 ? money(value) : '—'}</span>

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit allowances"
        className="inline-flex items-center gap-1.5 tabular-nums hover:underline underline-offset-2"
        style={{ color: value > 0 ? '#1C1A16' : '#A1A1AA' }}
      >
        {value > 0 ? money(value) : 'Add'} <Pencil size={11} />
      </button>
    )
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1.5 justify-end">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <input
        name="allowances"
        type="number"
        step="0.01"
        min="0"
        defaultValue={value > 0 ? String(value) : ''}
        placeholder="0.00"
        autoFocus
        disabled={pending}
        className="w-24 border border-line rounded-lg px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white disabled:opacity-50"
        style={{ background: '#1C1A16' }}
        title="Save"
      >
        <Check size={13} />
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-xs text-muted hover:text-ink">Cancel</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}
