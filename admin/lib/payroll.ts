/**
 * Pay-band aggregation for the Xero payroll export (hours only).
 * Mirrors the shared labour engine's band logic, self-contained for the admin app.
 * For Xero we send HOURS per earnings rate; multipliers are irrelevant here
 * (Xero computes gross from the employee's pay template), so we only need the
 * band boundaries (OT thresholds + day type).
 */

export type PayBand = 'regular' | 'overtime_t1' | 'overtime_t2' | 'saturday' | 'sunday' | 'public_holiday'
export type DayType = 'weekday' | 'saturday' | 'sunday' | 'public_holiday'

export const PAY_BANDS: PayBand[] = ['regular', 'overtime_t1', 'overtime_t2', 'saturday', 'sunday', 'public_holiday']

export const PAY_BAND_LABELS: Record<PayBand, string> = {
  regular: 'Ordinary',
  overtime_t1: 'Overtime 1.5×',
  overtime_t2: 'Overtime 2.0×',
  saturday: 'Saturday',
  sunday: 'Sunday',
  public_holiday: 'Public Holiday',
}

interface WeekdayTier {
  band: 'regular' | 'overtime_t1' | 'overtime_t2'
  fromHour: number
  toHour: number | null
  multiplier: number
}

export interface PayConfig {
  standardDailyHours: number
  weekdayTiers: WeekdayTier[]
  saturdayMultiplier: number
  sundayMultiplier: number
  publicHolidayMultiplier: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Multiplier for each pay band, from the entity's pay config (e.g. OT 1.5×, Sat 1.5×). */
export function bandMultipliers(cfg: PayConfig): Record<PayBand, number> {
  const m: Record<PayBand, number> = {
    regular: 1,
    overtime_t1: 1.5,
    overtime_t2: 2,
    saturday: cfg.saturdayMultiplier,
    sunday: cfg.sundayMultiplier,
    public_holiday: cfg.publicHolidayMultiplier,
  }
  for (const t of cfg.weekdayTiers) m[t.band] = t.multiplier
  return m
}

/** Gross pay = Σ band hours × hourly rate × band multiplier. */
export function grossPay(
  bandHours: Record<PayBand, number>,
  hourlyRate: number,
  cfg: PayConfig,
): { gross: number; bandCost: Record<PayBand, number> } {
  const mult = bandMultipliers(cfg)
  const bandCost = {} as Record<PayBand, number>
  let gross = 0
  for (const b of PAY_BANDS) {
    const cost = round2((bandHours[b] || 0) * hourlyRate * mult[b])
    bandCost[b] = cost
    gross = round2(gross + cost)
  }
  return { gross, bandCost }
}

export function classifyDay(dateISO: string, isPublicHoliday: boolean): DayType {
  if (isPublicHoliday) return 'public_holiday'
  const [y, m, d] = dateISO.split('-').map(Number)
  const dow = new Date(y!, m! - 1, d!).getDay() // 0 = Sun … 6 = Sat
  if (dow === 6) return 'saturday'
  if (dow === 0) return 'sunday'
  return 'weekday'
}

/** Split one day's total hours into band → hours per the weekday OT ladder / weekend rules. */
export function splitDayHours(totalHours: number, dayType: DayType, cfg: PayConfig): Partial<Record<PayBand, number>> {
  if (totalHours <= 0) return {}
  if (dayType === 'weekday') {
    const out: Partial<Record<PayBand, number>> = {}
    for (const t of cfg.weekdayTiers) {
      const upper = t.toHour ?? Infinity
      const h = Math.max(0, Math.min(totalHours, upper) - t.fromHour)
      if (h > 0) out[t.band] = round2((out[t.band] ?? 0) + h)
    }
    return out
  }
  return { [dayType]: round2(totalHours) }
}

export interface TimesheetRow {
  profile_id: string
  work_date: string
  hours: number | string
  profiles?: { name?: string; email?: string } | null
}

export interface EmployeeBands {
  profileId: string
  name: string
  email: string | null
  bandHours: Record<PayBand, number>
  totalHours: number
}

/**
 * Aggregate an entity's timesheet rows into per-employee band hours for a period.
 * Daily totals drive the OT ladder (overtime is a function of total hours per day).
 */
/**
 * Per-project labour totals for a set of timesheet rows.
 *
 * The pay-band ladder (regular / OT 1.5× / OT 2× / weekend / holiday) is a
 * function of an employee's TOTAL hours on a given day, regardless of project.
 * So we band each employee-day as a whole to get its dollar cost, then split
 * that day's cost across the projects worked that day **pro-rata by hours**.
 * This attributes overtime/weekend loading fairly to the projects that caused it.
 *
 * `rateFor(profileId)` returns the employee's hourly rate (0 if unknown → cost 0).
 */
export interface ProjectTotal {
  projectId: string
  hours: number
  cost: number
}

export interface ProjectTimesheetRow {
  profile_id: string
  project_id: string
  work_date: string
  hours: number | string
}

export function aggregateByProject(
  rows: ProjectTimesheetRow[],
  holidays: Set<string>,
  cfg: PayConfig,
  rateFor: (profileId: string) => number,
): ProjectTotal[] {
  // profile → day → { total, byProject: project → hours }
  const byEmpDay = new Map<string, Map<string, { total: number; byProject: Map<string, number> }>>()
  for (const r of rows) {
    if (!r.profile_id || !r.project_id) continue
    const days = byEmpDay.get(r.profile_id) ?? new Map()
    const day = days.get(r.work_date) ?? { total: 0, byProject: new Map<string, number>() }
    const h = Number(r.hours)
    day.total = round2(day.total + h)
    day.byProject.set(r.project_id, round2((day.byProject.get(r.project_id) ?? 0) + h))
    days.set(r.work_date, day)
    byEmpDay.set(r.profile_id, days)
  }

  const totals = new Map<string, ProjectTotal>()
  const bump = (projectId: string, hours: number, cost: number) => {
    const t = totals.get(projectId) ?? { projectId, hours: 0, cost: 0 }
    t.hours = round2(t.hours + hours)
    t.cost = round2(t.cost + cost)
    totals.set(projectId, t)
  }

  for (const [pid, days] of byEmpDay) {
    const rate = rateFor(pid)
    for (const [date, day] of days) {
      // Band the whole day → total dollar cost for the day.
      const dt = classifyDay(date, holidays.has(date))
      const split = splitDayHours(day.total, dt, cfg)
      const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
      for (const [band, h] of Object.entries(split)) bandHours[band as PayBand] = h as number
      const { gross } = grossPay(bandHours, rate, cfg)

      // Split the day's cost across projects pro-rata by hours worked that day.
      for (const [projectId, projHours] of day.byProject) {
        const share = day.total > 0 ? projHours / day.total : 0
        bump(projectId, projHours, round2(gross * share))
      }
    }
  }

  return [...totals.values()].sort((a, b) => b.cost - a.cost || b.hours - a.hours)
}

export function aggregatePayroll(
  rows: TimesheetRow[],
  holidays: Set<string>,
  cfg: PayConfig,
): EmployeeBands[] {
  const byEmpDay = new Map<string, Map<string, number>>()
  const meta = new Map<string, { name: string; email: string | null }>()

  for (const r of rows) {
    if (!r.profile_id) continue
    meta.set(r.profile_id, { name: r.profiles?.name ?? 'Unknown', email: r.profiles?.email ?? null })
    const days = byEmpDay.get(r.profile_id) ?? new Map<string, number>()
    days.set(r.work_date, round2((days.get(r.work_date) ?? 0) + Number(r.hours)))
    byEmpDay.set(r.profile_id, days)
  }

  const result: EmployeeBands[] = []
  for (const [pid, days] of byEmpDay) {
    const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    let total = 0
    for (const [date, hours] of days) {
      const dt = classifyDay(date, holidays.has(date))
      const split = splitDayHours(hours, dt, cfg)
      for (const [band, h] of Object.entries(split)) {
        bandHours[band as PayBand] = round2(bandHours[band as PayBand] + (h as number))
      }
      total = round2(total + hours)
    }
    const m = meta.get(pid)!
    result.push({ profileId: pid, name: m.name, email: m.email, bandHours, totalHours: total })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}
