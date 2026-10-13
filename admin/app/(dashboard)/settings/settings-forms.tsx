'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import { savePayCycleAction, saveLabourAlertAction } from './actions'
import type { PayCycle } from '@/lib/pay-cycle'

function SaveButton({ pending, saved }: { pending: boolean; saved: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl px-5 py-2.5 text-sm disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]"
      style={{ background: saved ? '#16A34A' : '#1C1A16', color: '#fff' }}
    >
      {pending ? (<><Loader2 size={16} className="animate-spin" /> Saving…</>) : saved ? (<><CheckCircle size={16} /> Saved</>) : 'Save'}
    </button>
  )
}

function useSavedFlash(pending: boolean, error: string | null) {
  const [saved, setSaved] = useState(false)
  const prev = useRef(false)
  useEffect(() => {
    if (prev.current && !pending && !error) {
      setSaved(true)
      const t = setTimeout(() => setSaved(false), 2500)
      return () => clearTimeout(t)
    }
    prev.current = pending
  }, [pending, error])
  return saved
}

export function PayCycleForm({ cycle, currentPeriod }: { cycle: PayCycle; currentPeriod: { start: string; end: string } }) {
  const [error, formAction, pending] = useActionState(savePayCycleAction, null)
  const [frequency, setFrequency] = useState<string>(cycle.frequency)
  const saved = useSavedFlash(pending, error)

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
          <XCircle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Pay frequency</span>
          <Dropdown
            name="frequency"
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'fortnightly', label: 'Fortnightly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </div>
        <Input
          label="First day of a known pay period"
          name="anchor_start"
          type="date"
          required
          defaultValue={cycle.anchorStart}
          disabled={pending}
        />
      </div>
      <p className="text-xs text-muted">
        Current period: <strong className="text-ink">{currentPeriod.start} → {currentPeriod.end}</strong>.
        &ldquo;New pay run&rdquo; defaults to the last completed period and the dashboard shows when payroll is next due.
      </p>
      <SaveButton pending={pending} saved={saved} />
    </form>
  )
}

export function LabourAlertForm({ enabled, thresholdPct }: { enabled: boolean; thresholdPct: number }) {
  const [error, formAction, pending] = useActionState(saveLabourAlertAction, null)
  const [on, setOn] = useState(enabled)
  const saved = useSavedFlash(pending, error)

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
          <XCircle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          name="enabled"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
        />
        <span>
          <span className="block text-sm font-medium text-ink">Alert admins when a project exceeds its labour budget</span>
          <span className="block text-xs text-muted mt-0.5">
            Checked each time a pay run is created or recalculated. Projects need a labour budget (Projects → Edit).
          </span>
        </span>
      </label>
      <div className="max-w-xs">
        <Input
          label="Alert at % of budget"
          name="threshold_pct"
          type="number"
          min="1"
          max="500"
          step="1"
          defaultValue={String(thresholdPct)}
          disabled={pending || !on}
        />
      </div>
      <SaveButton pending={pending} saved={saved} />
    </form>
  )
}
