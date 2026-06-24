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
