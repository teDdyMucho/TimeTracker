import { createClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import TimesheetsTable from './timesheets-table'

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const from = params.from ?? twoWeeksAgo
  const to = params.to ?? today
  const statusFilter = params.status ?? 'submitted'

  let query = supabase
    .from('timesheets')
    .select(
      'id, work_date, hours, work_location, overtime_status, status, created_at, profiles!inner(name), projects!inner(name)',
    )
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data: timesheets } = await query

  return (
    <div>
      <PageHeader title="Timesheets" subtitle="Review and approve submitted timesheets" />

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted">Status</label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="locked">Locked</option>
            <option value="all">All</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-brand text-white font-semibold rounded-xl px-4 py-2 text-sm hover:bg-teal-500 transition-colors"
        >
          Filter
        </button>
      </form>

      <Card>
        <TimesheetsTable timesheets={(timesheets ?? []) as any} />
      </Card>
    </div>
  )
}
