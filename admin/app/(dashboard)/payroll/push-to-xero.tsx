'use client'
import { useState } from 'react'
import { Upload, Loader2, CheckCircle, XCircle } from 'lucide-react'

/**
 * Push a pay run's approved hours to Xero as APPROVED timesheets.
 * Writes to Xero, so it confirms first and shows a per-employee result.
 */
export default function PushToXeroButton({ runId }: { runId: string }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'pushing'>('idle')
  const [result, setResult] = useState<any | null>(null)

  const push = async () => {
    setState('pushing')
    try {
      const res = await fetch(`/api/xero/push-timesheet?run=${runId}`, { method: 'POST' })
      setResult(await res.json())
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Push failed.' })
    } finally {
      setState('idle')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setState('confirm')}
        disabled={state === 'pushing'}
        title="Send approved timesheets to Xero"
        className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-semibold text-white transition-colors whitespace-nowrap disabled:opacity-50"
        style={{ background: '#13B5EA' /* Xero blue */ }}
      >
        {state === 'pushing' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        Push to Xero
      </button>

      {/* Confirm modal */}
      {state === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setState('idle')}>
          <div className="glass-panel rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink mb-2">Push timesheets to Xero?</h3>
            <p className="text-sm text-muted mb-5">
              This sends each employee&rsquo;s <strong>worked hours</strong> and any approved <strong>leave</strong> to Xero
              for this period. The timesheets arrive as <strong>drafts</strong> — your team reviews and approves them in Xero,
              then runs payroll and the hours &amp; leave appear on the payslips. Nothing is approved or posted automatically.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={push}
                className="flex-1 bg-brand text-white font-semibold rounded-xl py-2.5 text-sm hover:bg-brand-dark transition-colors"
              >
                Push now
              </button>
              <button
                type="button"
                onClick={() => setState('idle')}
                className="flex-1 border border-line text-muted font-semibold rounded-xl py-2.5 text-sm hover:bg-stone transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setResult(null)}>
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {result.error ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="text-red-500" size={22} />
                  <h3 className="text-lg font-bold text-ink">Push failed</h3>
                </div>
                <p className="text-sm text-red-600 break-words">{String(result.error)}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  {(result.pushed > 0 || result.leavePushed > 0) ? <CheckCircle className="text-brand" size={22} /> : <XCircle className="text-amber-500" size={22} />}
                  <h3 className="text-lg font-bold text-ink">Pushed to Xero</h3>
                </div>
                <p className="text-xs text-muted mb-4">{result.note}</p>

                <h4 className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">
                  Timesheets ({result.pushed}/{result.total})
                </h4>
                <div className="space-y-1.5 mb-4">
                  {(result.results ?? []).map((r: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {r.ok
                        ? <CheckCircle size={14} className="text-brand mt-0.5 shrink-0" />
                        : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <span className="font-medium text-ink">{r.employee}</span>
                        {!r.ok && <span className="text-muted"> — {r.reason ?? (typeof r.error === 'string' ? r.error : 'error')}</span>}
                        {r.ok && r.unmapped && <span className="text-amber-600 text-xs"> (skipped: {r.unmapped.join(', ')})</span>}
                      </div>
                    </div>
                  ))}
                  {(result.results ?? []).length === 0 && <p className="text-xs text-muted">No worked hours in this period.</p>}
                </div>

                {(result.leaveTotal ?? 0) > 0 && (
                  <>
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">
                      Leave ({result.leavePushed}/{result.leaveTotal})
                    </h4>
                    <div className="space-y-1.5">
                      {(result.leaveResults ?? []).map((r: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          {r.ok
                            ? <CheckCircle size={14} className="text-brand mt-0.5 shrink-0" />
                            : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
                          <div className="min-w-0">
                            <span className="font-medium text-ink">{r.employee}</span>
                            {r.ok && r.leaveType && <span className="text-muted text-xs"> — {r.leaveType} ({r.dates})</span>}
                            {!r.ok && <span className="text-muted"> — {r.reason ?? (typeof r.error === 'string' ? r.error : 'error')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setResult(null)}
              className="w-full mt-5 bg-ink text-white font-semibold rounded-xl py-2.5 text-sm hover:opacity-90 transition-colors"
              style={{ background: '#1C1A16' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}
