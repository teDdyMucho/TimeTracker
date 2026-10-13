'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { XCircle, Loader2, X } from 'lucide-react'
import { updatePayConfigAction } from './actions'
import { Input, Button } from '@/components/ui'

export interface PayConfigView {
  standardDailyHours: number
  t1To: number
  t1Multiplier: number
  t2Multiplier: number
  saturdayMultiplier: number
  sundayMultiplier: number
  publicHolidayMultiplier: number
  overtimeRequiresApproval: boolean
}

/**
 * Edit an entity's overtime ladder, weekend / public-holiday multipliers and
 * the "overtime must be approved" rule. Applies to the next pay run or
 * Recalculate; pushed Xero runs are unaffected.
 */
export default function PaySettingsForm({
  entity,
  onClose,
}: {
  entity: { id: string; name: string; pay: PayConfigView }
  onClose: () => void
}) {
  const [serverError, formAction, pending] = useActionState(updatePayConfigAction, null)
  const [requires, setRequires] = useState(entity.pay.overtimeRequiresApproval)
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
      <div className="glass-panel rounded-3xl w-full max-w-lg animate-scale-in my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-ink">Pay settings — {entity.name}</h2>
            <p className="text-sm text-muted mt-0.5">Overtime ladder, weekend and public-holiday rates</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone text-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        <form
          action={(fd) => { fd.set('id', entity.id); return formAction(fd) }}
          className="px-7 py-6 space-y-5"
        >
          {serverError && (
            <div className="flex items-start gap-2 text-[#F87171] rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <XCircle size={16} className="shrink-0 mt-0.5" /> {serverError}
            </div>
          )}

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">Weekday ladder</h3>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Ordinary hours / day" name="standard_hours" type="number" step="0.5" min="0.5" max="24" required defaultValue={String(entity.pay.standardDailyHours)} disabled={pending} />
              <Input label="OT tier 1 ends at (h)" name="t1_to" type="number" step="0.5" min="0.5" max="24" required defaultValue={String(entity.pay.t1To)} disabled={pending} />
              <div />
              <div />
              <Input label="OT tier 1 ×" name="t1_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.t1Multiplier)} disabled={pending} />
              <Input label="OT tier 2 ×" name="t2_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.t2Multiplier)} disabled={pending} />
            </div>
            <p className="text-[11px] text-muted mt-2 leading-snug">
              Hours 0–{entity.pay.standardDailyHours} ordinary, then tier 1 up to {entity.pay.t1To}h, tier 2 after that. Applies per day across all projects.
            </p>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">Day-type multipliers</h3>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Saturday ×" name="saturday_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.saturdayMultiplier)} disabled={pending} />
              <Input label="Sunday ×" name="sunday_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.sundayMultiplier)} disabled={pending} />
              <Input label="Public holiday ×" name="public_holiday_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.publicHolidayMultiplier)} disabled={pending} />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl p-3" style={{ background: '#FAF9F6', border: '1px solid #ECEAE4' }}>
            <input
              type="checkbox"
              name="overtime_requires_approval"
              checked={requires}
              onChange={(e) => setRequires(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Overtime must be approved before it is paid at overtime rates</span>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                When on, weekday hours past the ordinary cut-off are paid at the ordinary rate unless the worker&rsquo;s
                overtime request for that day was approved on the Overtime page. Saturday, Sunday and public-holiday
                rates still apply. When off, overtime is paid from hours alone (current behaviour).
              </span>
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#1C1A16', color: '#fff' }}
            >
              {pending ? (<><Loader2 size={16} className="animate-spin" /> Saving…</>) : 'Save pay settings'}
            </button>
            <Button type="button" label="Cancel" variant="ghost" className="flex-1" onClick={onClose} disabled={pending} />
          </div>
          <p className="text-[11px] text-muted leading-snug">
            Changes apply to the next pay run or when you Recalculate an existing one. Runs already pushed to Xero are not changed.
          </p>
        </form>
      </div>
    </div>
  )
}
