import { createClient, createAdminClient } from '@/lib/server'
import Link from 'next/link'
import { formatHours } from '@/lib/format'
import { ArrowRight, Briefcase, Clock } from 'lucide-react'
import WeeklyChart from './weekly-chart'
import DashboardStatCards from './dashboard-stat-cards'
import TeamDonut from './team-donut'
import WeekPicker from './week-picker'
import HeaderActions from './header-actions'
import type { StatCard } from './dashboard-stat-cards'

export const dynamic = 'force-dynamic'

const DAY_LABELS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PROJECT_COLORS = ['#9A7A4E', '#6F5B45', '#F5B33E', '#C7AB82', '#D2C5AE']
const USER_COLORS    = ['#6F5B45', '#9A7A4E', '#C7AB82', '#5A4A38', '#B08D57', '#D2C5AE']

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const supabase    = await createClient()
  const adminClient = createAdminClient()
  const params      = await searchParams

  const today         = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const weekAnchor    = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today
  const weekStart     = getWeekStart(weekAnchor)
  const weekEndStr    = addDays(weekStart, 6)
  const lwStart       = addDays(weekStart, -7)
  const lwEnd         = addDays(weekStart, -1)
  const since7        = addDays(today, -7)
  const isCurrentWeek = weekStart === getWeekStart(today)

  const headerDate = new Date().toLocaleDateString('en-AU', {
    timeZone: 'Australia/Brisbane', weekday: 'long', day: 'numeric', month: 'long',
  })

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  })

  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, employeesRes, projectsRes, newProjectsRes, overtimeRes, weekTimesheetsRes, lastWeekRes, recentRes] =
    await Promise.all([
      adminClient.from('profiles').select('name').eq('id', user?.id ?? '').maybeSingle(),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').neq('role', 'admin'),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', since7),
      supabase.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('timesheets')
        .select('hours, work_date, profile_id, project_id, work_location, status, profiles(name), projects(name)')
        .gte('work_date', weekStart)
        .lte('work_date', weekEndStr),
      supabase.from('timesheets').select('hours').gte('work_date', lwStart).lte('work_date', lwEnd),
      supabase
        .from('timesheets')
        .select('id, work_date, hours, work_location, created_at, status, profiles!inner(name, avatar_url), projects!inner(name)')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

  const firstName      = (profileRes.data?.name ?? 'Admin').split(' ')[0]
  const weekTimesheets = (weekTimesheetsRes.data ?? []) as any[]
  const recent         = (recentRes.data ?? []) as any[]
  const weekHours      = weekTimesheets.reduce((s, r) => s + Number(r.hours), 0)
  const lastWeekHours  = (lastWeekRes.data ?? []).reduce((s, r: any) => s + Number(r.hours), 0)
  const pendingCount   = overtimeRes.count ?? 0
  const newProjects    = newProjectsRes.count ?? 0

  // Hours WoW trend
  let hoursTrend: { text: string; positive: boolean } | undefined
  if (lastWeekHours > 0) {
    const pct = Math.round(((weekHours - lastWeekHours) / lastWeekHours) * 100)
    hoursTrend = { text: `${Math.abs(pct)}%`, positive: pct >= 0 }
  } else if (weekHours > 0) {
    hoursTrend = { text: 'New', positive: true }
  }

  // Per-user series for multi-line chart
  const userMap = new Map<string, { name: string; dayHours: Map<string, number> }>()
  for (const t of weekTimesheets) {
    if (!t.profile_id) continue
    const name = (t.profiles as any)?.name ?? 'Team Member'
    if (!userMap.has(t.profile_id)) userMap.set(t.profile_id, { name, dayHours: new Map() })
    const u = userMap.get(t.profile_id)!
    u.dayHours.set(t.work_date, Math.round(((u.dayHours.get(t.work_date) ?? 0) + Number(t.hours)) * 100) / 100)
  }
  const userSeriesArr = Array.from(userMap.entries()).map(([userId, { name, dayHours }], i) => ({
    userId,
    name,
    color: USER_COLORS[i % USER_COLORS.length],
    days: weekDays.map((date, j) => ({
      label: DAY_LABELS[j], date, isToday: date === today, hours: dayHours.get(date) ?? 0,
    })),
  }))
  const chartSeries = userSeriesArr.length > 0 ? userSeriesArr : [{
    userId: '__total__',
    name: 'Total Hours',
    color: '#6F5B45',
    days: weekDays.map((date, j) => ({
      label: DAY_LABELS[j], date, isToday: date === today,
      hours: weekTimesheets.filter((t) => t.work_date === date).reduce((s, r) => s + Number(r.hours), 0),
    })),
  }]

  // Top projects
  const projectMap = new Map<string, { name: string; hours: number }>()
  for (const t of weekTimesheets) {
    if (!t.project_id) continue
    const name = t.projects?.name ?? 'Unknown'
    const cur  = projectMap.get(t.project_id) ?? { name, hours: 0 }
    projectMap.set(t.project_id, { ...cur, hours: Math.round((cur.hours + Number(t.hours)) * 100) / 100 })
  }
  const topProjects = Array.from(projectMap.values()).sort((a, b) => b.hours - a.hours).slice(0, 5)
  const maxPH = topProjects[0]?.hours ?? 1

  const statusCounts = {
    submitted: weekTimesheets.filter((t) => t.status === 'submitted').length,
    approved:  weekTimesheets.filter((t) => t.status === 'approved').length,
    locked:    weekTimesheets.filter((t) => t.status === 'locked').length,
  }

  // Week label
  const weekEnd = new Date(weekStart + 'T00:00:00')
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const statCards: StatCard[] = [
    {
      label: 'Active Employees',
      value: String(employeesRes.count ?? 0),
      iconName: 'users',
      href: '/employees',
      iconBg: '#F0EBE3',
      iconColor: '#6F5B45',
      sub: 'Team members',
    },
    {
      label: 'Hours This Week',
      value: formatHours(weekHours),
      iconName: 'clock',
      href: '/timesheets',
      iconBg: 'rgba(154,122,78,0.12)',
      iconColor: '#9A7A4E',
      trend: hoursTrend,
      sub: hoursTrend ? 'vs last week' : `${weekTimesheets.length} logged`,
    },
    {
      label: 'Pending Overtime',
      value: String(pendingCount),
      iconName: 'timer',
      href: '/overtime',
      iconBg: '#FCF3E2',
      iconColor: '#F5B33E',
      sub: pendingCount > 0 ? 'Awaiting review' : 'All cleared',
    },
    {
      label: 'Active Projects',
      value: String(projectsRes.count ?? 0),
      iconName: 'folder',
      href: '/projects',
      iconBg: '#F0EBE3',
      iconColor: '#836439',
      trend: newProjects > 0 ? { text: `${newProjects} new`, positive: true } : undefined,
      sub: newProjects > 0 ? 'this week' : 'In progress',
    },
  ]

  return (
    <div>

      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#9A7A4E' }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: '#9A7A4E' }}>
              {headerDate}
            </span>
          </div>
          <h1 className="text-[1.7rem] font-extrabold leading-tight" style={{ color: '#2D2A26' }}>
            Welcome back, {firstName}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8A857C' }}>
            Here&rsquo;s your team&rsquo;s activity at a glance.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          {/* Week selector */}
          <WeekPicker
            weekStart={weekStart}
            label={weekLabel}
            prevWeek={addDays(weekStart, -7)}
            nextWeek={addDays(weekStart, 7)}
            today={today}
            isCurrentWeek={isCurrentWeek}
          />

          {/* Notifications + account menu */}
          <HeaderActions
            userName={profileRes.data?.name ?? 'Admin'}
            userEmail={user?.email ?? ''}
            pendingCount={pendingCount}
          />
        </div>
      </div>

      {/* ── KPI CARDS ────────────────────────────────────────────────────────── */}
      <DashboardStatCards cards={statCards} />

      {/* ── CHART + TEAM ACTIVITY ─────────────────────────────────────────────── */}
      <div className="grid xl:grid-cols-5 gap-5 mb-5 animate-fade-in-up delay-150">

        {/* Chart — 3/5 */}
        <div className="xl:col-span-3 bg-white rounded-2xl flex flex-col border border-[#ECEAE4] shadow-card">
          <div className="px-6 pt-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base" style={{ color: '#2D2A26' }}>Time Tracking Overview</h2>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {chartSeries.map((s) => (
                  <span key={s.userId} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#8A857C' }}>
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.color }} />
                    {s.name || 'Total Hours'}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#ECEAE4] select-none whitespace-nowrap"
              style={{ color: '#6B6660', background: '#FAF9F6' }}>
              {isCurrentWeek ? 'This Week' : weekLabel}
            </div>
          </div>

          <div className="px-2 pt-2 pb-3 flex-1">
            <WeeklyChart series={chartSeries} />
          </div>
        </div>

        {/* Team Activity — 2/5 */}
        <div className="xl:col-span-2">
          <TeamDonut statusCounts={statusCounts} />
        </div>
      </div>

      {/* ── RECENT ACTIVITY + TOP PROJECTS ───────────────────────────────────── */}
      <div className="grid xl:grid-cols-2 gap-5 animate-fade-in-up delay-300">

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6 border border-[#ECEAE4] shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold" style={{ color: '#2D2A26' }}>Recent Activity</h2>
            <Link href="/timesheets" className="text-xs font-bold flex items-center gap-1" style={{ color: '#9A7A4E' }}>
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-xl" style={{ background: '#F7F6F2' }}>📋</div>
              <p className="text-sm" style={{ color: '#A39C90' }}>No activity this week.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recent.map((t: any) => {
                const initials = (t.profiles?.name ?? 'U')[0].toUpperCase()
                const time = t.created_at
                  ? new Date(t.created_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit', hour12: true })
                  : ''
                return (
                  <div key={t.id} className="flex items-center gap-3 py-3 px-3 -mx-3 rounded-xl transition-colors hover:bg-[#FAF9F6]">
                    <div className="relative shrink-0">
                      {t.profiles?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.profiles.avatar_url}
                          alt={t.profiles?.name ?? 'Employee'}
                          className="w-9 h-9 rounded-full object-cover"
                          style={{ border: '1px solid #ECEAE4' }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #6F5B45, #5A4A38)' }}>
                          {initials}
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white"
                        style={{ background: '#9A7A4E' }}>
                        <Clock size={8} className="text-white" strokeWidth={3} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug" style={{ color: '#2D2A26' }}>
                        <span className="font-bold">{t.profiles?.name ?? '—'}</span>
                        {' logged '}
                        <span className="font-bold" style={{ color: '#836439' }}>{formatHours(t.hours)}</span>
                        {' on '}
                        <span className="font-semibold">{t.projects?.name ?? '—'}</span>
                      </p>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: '#B4AEA3' }}>
                        {t.work_date} · {t.work_location}
                      </p>
                    </div>
                    {time && <span className="text-xs font-medium shrink-0" style={{ color: '#B4AEA3' }}>{time}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top Projects */}
        <div className="bg-white rounded-2xl p-6 border border-[#ECEAE4] shadow-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold" style={{ color: '#2D2A26' }}>Top Projects by Hours</h2>
            <Link href="/reports" className="text-xs font-bold flex items-center gap-1" style={{ color: '#9A7A4E' }}>
              View report <ArrowRight size={12} />
            </Link>
          </div>

          {topProjects.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-xl" style={{ background: '#F7F6F2' }}>📁</div>
              <p className="text-sm" style={{ color: '#A39C90' }}>No project hours this week.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topProjects.map((p, i) => {
                const color = PROJECT_COLORS[i % PROJECT_COLORS.length]
                const pct   = Math.round((p.hours / maxPH) * 100)
                return (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${color}1A` }}>
                      <Briefcase size={16} style={{ color }} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold truncate pr-2" style={{ color: '#2D2A26' }}>{p.name}</span>
                        <span className="text-sm font-bold shrink-0 tabular-nums" style={{ color: '#2D2A26' }}>{formatHours(p.hours)}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F2F0EA' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

function getWeekStart(today: string): string {
  const d    = new Date(today + 'T00:00:00')
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
}
