import { createClient } from '@/lib/server'
import { StatsCard, Card, Badge, PageHeader } from '@/components/ui'
import { Users, Clock, AlertCircle, DollarSign } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const weekStart = getWeekStart(today)

  const [employeesRes, overtimeRes, weekTimesheetsRes, recentRes, payrollRes] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .neq('role', 'admin'),
      supabase
        .from('overtime_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('timesheets')
        .select('hours')
        .gte('work_date', weekStart)
        .lte('work_date', today),
      supabase
        .from('timesheets')
        .select(
          'id, work_date, hours, work_location, overtime_status, status, profiles!inner(name), projects!inner(name)',
        )
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('payroll_runs')
        .select('period_start, period_end, total_gross, status')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const weekHours =
    Math.round(
      (weekTimesheetsRes.data ?? []).reduce((s, r) => s + Number(r.hours), 0) * 10,
    ) / 10

  const lastPayroll = payrollRes.data

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Week of ${weekStart}`} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Active Employees"
          value={employeesRes.count ?? 0}
          icon={<Users size={20} className="text-brand" />}
          href="/employees"
        />
        <StatsCard
          title="Hours This Week"
          value={`${weekHours} h`}
          icon={<Clock size={20} className="text-brand" />}
          href="/timesheets"
        />
        <StatsCard
          title="Pending Overtime"
          value={overtimeRes.count ?? 0}
          icon={<AlertCircle size={20} className="text-amber-500" />}
          href="/overtime"
          alert={(overtimeRes.count ?? 0) > 0}
        />
        <StatsCard
          title="Last Payroll"
          value={
            lastPayroll
              ? `$${Number(lastPayroll.total_gross).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
              : '—'
          }
          subtitle={
            lastPayroll
              ? `${lastPayroll.period_start} – ${lastPayroll.period_end}`
              : 'No runs yet'
          }
          icon={<DollarSign size={20} className="text-brand" />}
          href="/payroll"
        />
      </div>

      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-ink text-lg">Recent Timesheets</h2>
          <Link href="/timesheets" className="text-brand text-sm font-medium hover:underline">
            View all
          </Link>
        </div>
        {(recentRes.data ?? []).length === 0 ? (
          <p className="text-muted text-sm py-4">No timesheets yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100">
                {['Employee', 'Date', 'Project', 'Location', 'Hours', 'Status'].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(recentRes.data ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium">{t.profiles?.name ?? '—'}</td>
                  <td className="py-3 pr-4 text-muted">{t.work_date}</td>
                  <td className="py-3 pr-4 text-muted">{t.projects?.name ?? '—'}</td>
                  <td className="py-3 pr-4 capitalize text-muted">{t.work_location}</td>
                  <td className="py-3 pr-4 font-semibold">{Number(t.hours)} h</td>
                  <td className="py-3">
                    <Badge
                      status={
                        t.overtime_status !== 'none' ? t.overtime_status : t.status
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function getWeekStart(today: string): string {
  const d = new Date(today + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
}
