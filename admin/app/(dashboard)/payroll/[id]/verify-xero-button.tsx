'use client'
import { useState } from 'react'
import { ShieldCheck, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

interface LineCompare { rate: string; ours: number; xero: number; match: boolean }
interface EmployeeCompare {
  employee: string
  matched: boolean
  xeroStatus?: string
  lines: LineCompare[]
  oursTotal: number
  xeroTotal: number
  hoursMatch: boolean
  oursGross?: number
  xeroWages?: number | null
  grossMatch?: boolean | null
  note?: string
}
interface Result {
  error?: string
  hint?: string
  entity?: string
  period?: { from: string; to: string }
  timesheetsFound?: number
  payRun?: { id: string; status: string; period: string } | null
  payRunNote?: string
  employees?: EmployeeCompare[]
  summary?: { employees: number; hoursMatched: number; grossMatched: number | null; unmatched: number }
}

const hrs = (n: number) => `${Math.round(n * 100) / 100}h`
const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

/**
 * Read-only check of this run against Xero (PRD task "Validate matching, bands
 * and Xero pay result"): employee matching, hours per earnings rate on the Xero
 * timesheets for the period, and — once Xero has a pay run for the period — the
 * wages on each payslip against our gross.
 */
export default function VerifyXeroButton({ runId, entityName }: { runId: string; entityName: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const verify = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/xero/validate?run=${runId}`)
      const text = await res.text()
      let data: Result
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: `Unexpected response (${res.status}).` } }
      if (!res.ok && !data.error) data.error = data.hint ?? `Check failed (${res.status}).`
      setResult(data)
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Check failed.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={verify}
        disabled={loading}
        title="Compare this run with what Xero has (read-only)"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap disabled:opacity-50"
        style={{ borderColor: '#13B5EA', color: '#0B7FA6' }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        Verify in Xero
      </button>

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setResult(null)}>
          <div className="glass-panel rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {result.error ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="text-red-500" size={22} />
                  <h3 className="text-lg font-bold text-ink">Could not verify</h3>
                </div>
                <p className="text-sm text-red-600 break-words">{result.error}</p>
                {result.hint && <p className="text-xs text-muted mt-2">{result.hint}</p>}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  {result.summary && result.summary.unmatched === 0 && result.summary.hoursMatched === result.summary.employees
                    ? <CheckCircle className="text-brand" size={22} />
                    : <AlertTriangle className="text-amber-500" size={22} />}
                  <h3 className="text-lg font-bold text-ink">Xero check — {entityName}</h3>
                </div>
                <p className="text-xs text-muted mb-4">
                  {result.period?.from} – {result.period?.to} · {result.timesheetsFound ?? 0} Xero timesheet{(result.timesheetsFound ?? 0) !== 1 ? 's' : ''} in this period
                  {result.payRun ? ` · Xero pay run ${result.payRun.status} (${result.payRun.period})` : result.payRunNote ? '' : ' · no Xero pay run for this period yet'}
                </p>
                {result.payRunNote && (
                  <p className="text-xs rounded-xl px-3 py-2 mb-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>{result.payRunNote}</p>
                )}

                {result.summary && (
                  <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                    <div className="rounded-xl p-3" style={{ background: '#F4F4F5' }}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Matched in Xero</div>
                      <div className="text-xl font-black tabular-nums">{result.summary.employees - result.summary.unmatched}/{result.summary.employees}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#F4F4F5' }}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Hours agree</div>
                      <div className="text-xl font-black tabular-nums">{result.summary.hoursMatched}/{result.summary.employees}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#F4F4F5' }}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Gross agrees</div>
                      <div className="text-xl font-black tabular-nums">{result.summary.grossMatched == null ? '—' : `${result.summary.grossMatched}/${result.summary.employees}`}</div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {(result.employees ?? []).map((e) => (
                    <div key={e.employee} className="rounded-xl border border-line p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {e.matched && e.hoursMatch && e.grossMatch !== false
                            ? <CheckCircle size={15} className="text-brand" />
                            : <XCircle size={15} className="text-red-400" />}
                          <span className="font-semibold text-ink">{e.employee}</span>
                          {e.xeroStatus && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-stone text-muted">{e.xeroStatus}</span>}
                        </div>
                        <div className="text-xs text-muted tabular-nums">
                          ours {hrs(e.oursTotal)} · Xero {hrs(e.xeroTotal)}
                          {e.oursGross != null && <> · gross ours {money(e.oursGross)}{e.xeroWages != null ? ` · Xero ${money(e.xeroWages)}` : ''}</>}
                        </div>
                      </div>
                      {e.note && <p className="text-xs text-amber-700 mt-1">{e.note}</p>}
                      {e.lines.length > 0 && (
                        <table className="w-full text-xs mt-2">
                          <tbody>
                            {e.lines.map((l) => (
                              <tr key={l.rate} className={l.match ? '' : 'text-red-600'}>
                                <td className="py-0.5 pr-3 text-muted">{l.rate}</td>
                                <td className="py-0.5 pr-3 text-right tabular-nums">{hrs(l.ours)}</td>
                                <td className="py-0.5 text-right tabular-nums">{hrs(l.xero)} {l.match ? '✓' : '✗'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setResult(null)}
              className="w-full mt-5 text-white font-semibold rounded-xl py-2.5 text-sm hover:opacity-90 transition-colors"
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
