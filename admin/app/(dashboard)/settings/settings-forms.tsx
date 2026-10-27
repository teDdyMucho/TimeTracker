'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Play } from 'lucide-react'
import { Input } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import { savePayCycleAction, saveLabourAlertAction, saveAutoPayRunAction } from './actions'
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

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
      <XCircle size={16} className="shrink-0 mt-0.5" /> {error}
    </div>
  )
}

export function PayCycleForm({ cycle, currentPeriod }: { cycle: PayCycle; currentPeriod: { start: string; end: string } }) {
  const [error, formAction, pending] = useActionState(savePayCycleAction, null)
  const [frequency, setFrequency] = useState<string>(cycle.frequency)
  const saved = useSavedFlash(pending, error)

  return (
    <form action={formAction} className="flex flex-col flex-1 gap-4">
      <ErrorBox error={error} />
      <div className="grid sm:grid-cols-2 gap-4 items-end">
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
      <div className="mt-auto pt-1"><SaveButton pending={pending} saved={saved} /></div>
    </form>
  )
}

export function LabourAlertForm({ enabled, thresholdPct, defaultBudget }: { enabled: boolean; thresholdPct: number; defaultBudget: number | null }) {
  const [error, formAction, pending] = useActionState(saveLabourAlertAction, null)
  const [on, setOn] = useState(enabled)
  const saved = useSavedFlash(pending, error)

  return (
    <form action={formAction} className="flex flex-col flex-1 gap-4">
      <ErrorBox error={error} />
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
            Checked each time a pay run is created or recalculated. Uses the project&rsquo;s own budget (Projects → Edit), or the default below.
          </span>
        </span>
      </label>
      <div className="grid sm:grid-cols-2 gap-4 items-end">
        <Input
          label="Alert at % of budget"
          name="threshold_pct"
          type="number"
          min="1"
          max="500"
          step="1"
          defaultValue={String(thresholdPct)}
          disabled={pending}
        />
        <Input
          label="Default budget per project ($)"
          name="default_budget"
          type="number"
          min="0"
          step="100"
          placeholder="Blank = none"
          defaultValue={defaultBudget != null ? String(defaultBudget) : ''}
          disabled={pending}
        />
      </div>
      <div className="mt-auto pt-1"><SaveButton pending={pending} saved={saved} /></div>
    </form>
  )
}

export function AutoPayRunForm({ enabled, lastPeriod }: { enabled: boolean; lastPeriod: { start: string; end: string } }) {
  const [error, formAction, pending] = useActionState(saveAutoPayRunAction, null)
  const [on, setOn] = useState(enabled)
  const saved = useSavedFlash(pending, error)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const runNow = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/payroll/auto-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setResult(j.error ?? `Failed (${res.status})`)
      else if (j.skipped) setResult(`Skipped: ${j.skipped}`)
      else setResult((j.results ?? []).map((r: any) => `${r.entity}: ${r.created ? `created (${r.employees} employees)` : r.reason === 'exists' ? 'already has a run' : r.reason === 'no_attendance' ? 'no approved attendance yet' : r.message}`).join(' · '))
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <form action={formAction} className="flex flex-col flex-1 gap-4">
      <ErrorBox error={error} />
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
          <span className="block text-sm font-medium text-ink">Create the draft pay run automatically when a period ends</span>
          <span className="block text-xs text-muted mt-0.5">
            Runs just after midnight (Melbourne) the day after each period ends, for every entity that has approved attendance.
            Admins get a &ldquo;Pay run ready for review&rdquo; notification; if nothing is approved yet they get a reminder instead.
            Approve more attendance later and click Recalculate on the run.
          </span>
        </span>
      </label>
      <div className="mt-auto pt-1 flex flex-wrap-reverse items-center gap-3">
        <SaveButton pending={pending} saved={saved} />
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50"
          style={{ borderColor: 'rgba(28,26,22,0.35)', color: '#000' }}
          title={`Create runs for ${lastPeriod.start} → ${lastPeriod.end} now (skips entities that already have one)`}
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now for {lastPeriod.start} → {lastPeriod.end}
        </button>
      </div>
      {result && <p className="text-xs text-muted">{result}</p>}
    </form>
  )
}
