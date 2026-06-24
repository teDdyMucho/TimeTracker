import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import TimesheetsTable from './timesheets-table'
import TimesheetsFilter from './timesheets-filter'

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; employee?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const from = params.from ?? twoWeeksAgo
  const to = params.to ?? today
  const statusFilter = params.status ?? 'submitted'
  const employeeFilter = params.employee ?? ''

  const [employeesRes, timesheetsData] = await Promise.all([
    adminClient.from('profiles').select('id, name').neq('role', 'admin').eq('status', 'active').order('name'),
    (() => {
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

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (employeeFilter) query = query.eq('profile_id', employeeFilter)

      return query
    })(),
  ])

  const employees = employeesRes.data ?? []
  const timesheets = timesheetsData.data ?? []

  return (
    <div>
      <PageHeader title="Timesheets" subtitle="Review and approve submitted timesheets" />

      <TimesheetsFilter
        from={from}
        to={to}
        status={statusFilter}
        employee={employeeFilter}
        employees={employees as any}
      />

      <Card>
        <TimesheetsTable
          key={`${from}-${to}-${statusFilter}-${employeeFilter}`}
          timesheets={timesheets as any}
        />
      </Card>
    </div>
  )
}
