import { createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import { Trash2 } from 'lucide-react'
import HolidayForm from './holiday-form'
import { deleteHolidayAction } from './actions'

export const dynamic = 'force-dynamic'

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Public holidays admin (PRD §4). Every date here is banded at the entity's
 * public-holiday multiplier by payroll, project costing and the Xero push.
 */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const sp = await searchParams
  const admin = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const thisYear = today.slice(0, 4)
  const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : thisYear

  const [{ data: rows }, { data: yearsRows }] = await Promise.all([
    admin
      .from('public_holidays')
      .select('id, date, name, region')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date'),
    admin.from('public_holidays').select('date'),
  ])

  const holidays = (rows ?? []) as { id: string; date: string; name: string; region: string | null }[]
  const years = Array.from(new Set([...(yearsRows ?? []).map((r: any) => String(r.date).slice(0, 4)), thisYear, String(Number(thisYear) + 1)])).sort()
  const upcoming = holidays.filter((h) => h.date >= today).length

  return (
    <div>
      <PageHeader
        title="Public Holidays"
        subtitle={`${holidays.length} in ${year} · ${upcoming} upcoming`}
        action={<HolidayForm />}
      />

      <div className="flex items-center gap-1.5 mb-6 p-1 bg-white rounded-2xl border border-line shadow-card w-fit">
        {years.map((y) => (
          <a
            key={y}
            href={`/holidays?year=${y}`}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              y === year ? 'bg-[#1C1A16] text-white shadow-sm' : 'text-muted hover:bg-stone hover:text-ink'
            }`}
          >
            {y}
          </a>
        ))}
      </div>

      <Card>
        {holidays.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            No public holidays listed for {year}. Add them before running payroll for that year, or
            holiday hours will be paid at ordinary / weekend rates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  {['Date', 'Holiday', 'Region', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 text-[10px] font-semibold text-muted uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map((h) => (
                  <tr key={h.id} className={`hover:bg-slate-50/60 transition-colors ${h.date < today ? 'text-muted' : ''}`}>
                    <td className="py-3 pr-4 whitespace-nowrap font-medium">{fmt(h.date)}</td>
                    <td className="py-3 pr-4 font-semibold text-ink">{h.name}</td>
                    <td className="py-3 pr-4 text-xs">{h.region ?? <span className="text-slate-300">National</span>}</td>
                    <td className="py-3 text-right">
                      <form action={deleteHolidayAction}>
                        <input type="hidden" name="id" value={h.id} />
                        <button
                          type="submit"
                          title="Remove"
                          className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-medium border text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
                          style={{ borderColor: '#ECEAE4' }}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs mt-4" style={{ color: '#A39C90' }}>
        Payroll applies every date listed here regardless of region. Keep only the holidays that
        apply to your sites.
      </p>
    </div>
  )
}
