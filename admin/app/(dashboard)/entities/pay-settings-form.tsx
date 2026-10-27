'use client'
import { useActionState, useEffect, useRef } from 'react'
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
}

/**
 * Edit an entity's overtime, weekend and public-holiday RATES. The rules
 * themselves are fixed (Build One, 20 Oct 2026): 30 min unpaid break on any
 * day of 5 h or more; 7.6 h regular a day; anything over is overtime, pending
 * and unpaid until an approver approves it. Applies to the next pay run or
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
            <h2 className="text-lg font-bold text-ink">Pay rates — {entity.name}</h2>
            <p className="text-sm text-muted mt-0.5">Overtime, weekend and public-holiday multipliers</p>
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

          <div className="rounded-xl p-4 text-sm" style={{ background: '#FAF9F6', border: '1px solid #ECEAE4' }}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">Fixed rules (not editable)</h3>
            <ul className="space-y-1 text-ink">
              <li><strong>30 min unpaid break</strong> on any day of 5 hours or more.</li>
              <li><strong>7.6 h regular</strong> a day. Anything over is overtime.</li>
              <li>Overtime stays <strong>pending and unpaid until approved</strong> by Robbie, Mitch, Chris or Terry; the first 2 h are tier 1, the rest tier 2.</li>
              <li>Saturday, Sunday and public-holiday hours are paid at their rate below.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">Overtime rates</h3>
            <div className="grid grid-cols-2 gap-3 items-end">
              <Input label="Tier 1 (first 2 h over 7.6) ×" name="t1_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.t1Multiplier)} disabled={pending} />
              <Input label="Tier 2 (after that) ×" name="t2_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.t2Multiplier)} disabled={pending} />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">Day-type multipliers</h3>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Saturday ×" name="saturday_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.saturdayMultiplier)} disabled={pending} />
              <Input label="Sunday ×" name="sunday_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.sundayMultiplier)} disabled={pending} />
              <Input label="Public holiday ×" name="public_holiday_multiplier" type="number" step="0.05" min="0.1" required defaultValue={String(entity.pay.publicHolidayMultiplier)} disabled={pending} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#1C1A16', color: '#fff' }}
            >
              {pending ? (<><Loader2 size={16} className="animate-spin" /> Saving…</>) : 'Save pay rates'}
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
