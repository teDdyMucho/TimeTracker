import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/server'
import { Card, Badge } from '@/components/ui'
import { PAY_BANDS, PAY_BAND_LABELS } from '@/lib/payroll'
import { formatHours } from '@/lib/format'
import { ArrowLeft, Download } from 'lucide-react'

export const dynamic = 'force-dynamic'

const peso = (n: number) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('payroll_runs')
    .select(
      'id, period_start, period_end, status, business_entity_id, business_entities(name), payroll_entries(profile_id, band_hours, gross_pay, profiles(name, email))',
    )
    .eq('id', id)
    .maybeSingle()

  if (!run) return notFound()

  const entries = ((run as any).payroll_entries ?? []) as {
    profile_id: string
    band_hours: Record<string, number>
    gross_pay: number
    profiles?: { name?: string; email?: string }
  }[]

  // Which bands actually have hours anywhere — only show those columns
  const activeBands = PAY_BANDS.filter((b) => entries.some((e) => (e.band_hours?.[b] ?? 0) > 0))
  const totalGross = entries.reduce((s, e) => s + Number(e.gross_pay || 0), 0)
  const entityName = (run as any).business_entities?.name ?? '—'

  return (
    <div>
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm font-semibold mb-4" style={{ color: '#1C1A16' }}>
        <ArrowLeft size={14} /> Back to Payroll
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2D2A26' }}>{entityName} — Pay Run</h1>
          <p className="text-sm mt-1" style={{ color: '#8A857C' }}>
            {(run as any).period_start} → {(run as any).period_end} · {entries.length} employee{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/payroll/pdf?run=${id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 shadow-sm"
            style={{ background: '#1C1A16' }}
          >
            <Download size={14} /> Download PDF
          </a>
          <Badge status={(run as any).status} />
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#A39C90' }}>Total gross</div>
            <div className="text-2xl font-black tabular-nums" style={{ color: '#2D2A26' }}>{peso(totalGross)}</div>
          </div>
        </div>
      </div>

      <Card>
        {entries.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">No employees in this pay run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  <th className="pb-3 pr-4 text-[10px] font-semibold text-muted uppercase tracking-widest">Employee</th>
                  {activeBands.map((b) => (
                    <th key={b} className="pb-3 pr-4 text-[10px] font-semibold text-muted uppercase tracking-widest text-right whitespace-nowrap">
                      {PAY_BAND_LABELS[b]}
                    </th>
                  ))}
                  <th className="pb-3 pl-4 text-[10px] font-semibold text-muted uppercase tracking-widest text-right">Gross Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.profile_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-ink">{e.profiles?.name ?? '—'}</div>
                      <div className="text-xs text-muted">{e.profiles?.email ?? ''}</div>
                    </td>
                    {activeBands.map((b) => (
                      <td key={b} className="py-3 pr-4 text-right tabular-nums text-muted">
                        {(e.band_hours?.[b] ?? 0) > 0 ? formatHours(e.band_hours[b]) : '—'}
                      </td>
                    ))}
                    <td className="py-3 pl-4 text-right font-bold tabular-nums text-ink">{peso(e.gross_pay)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-3 font-bold text-ink" colSpan={activeBands.length + 1}>Total</td>
                  <td className="pt-3 pl-4 text-right font-black tabular-nums text-ink">{peso(totalGross)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs mt-4" style={{ color: '#A39C90' }}>
        Gross is computed from logged hours per band × each employee&rsquo;s hourly rate × the entity&rsquo;s
        overtime / weekend / public-holiday multipliers. Set rates in Employees; adjust multipliers per entity.
      </p>
    </div>
  )
}
