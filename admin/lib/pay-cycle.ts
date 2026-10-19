export type PayFrequency = 'weekly' | 'fortnightly' | 'monthly'

export interface PayCycle {
  frequency: PayFrequency
  /** YYYY-MM-DD — first day of a known pay period. */
  anchorStart: string
}

export const DEFAULT_PAY_CYCLE: PayCycle = { frequency: 'fortnightly', anchorStart: '2026-09-25' }

export function normalizePayCycle(raw: unknown): PayCycle {
  const c = (raw ?? {}) as Partial<PayCycle>
  const frequency: PayFrequency =
    c.frequency === 'weekly' || c.frequency === 'monthly' ? c.frequency : 'fortnightly'
  const anchorStart =
    typeof c.anchorStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.anchorStart)
      ? c.anchorStart
      : DEFAULT_PAY_CYCLE.anchorStart
  return { frequency, anchorStart }
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The anchor day moved by `k` whole months, clamped to the month's length so
 * an anchor on the 29th–31st never drifts (31 Jan + 1 month = 28/29 Feb, not
 * 3 Mar).
 */
function monthsFromAnchor(anchor: string, k: number): string {
  const [y, m, d] = anchor.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + k, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, lastDay))
  return first.toISOString().slice(0, 10)
}

export interface PayPeriod { start: string; end: string }

/** Start date of the k-th period from the anchor (k may be negative). */
function periodStart(cycle: PayCycle, k: number): string {
  if (cycle.frequency === 'weekly') return addDays(cycle.anchorStart, 7 * k)
  if (cycle.frequency === 'fortnightly') return addDays(cycle.anchorStart, 14 * k)
  return monthsFromAnchor(cycle.anchorStart, k)
}

/**
 * The pay period containing `date`, counted in whole periods from the anchor
 * (never chained from a previous computed date, so monthly cycles cannot
 * drift). Periods are inclusive of both ends.
 */
export function periodContaining(cycle: PayCycle, date: string): PayPeriod {
  let k = 0
  // Guard against runaway loops on absurd anchors (max ~40 years either way).
  let guard = 0
  while (periodStart(cycle, k) > date && guard++ < 2100) k--
  guard = 0
  while (periodStart(cycle, k + 1) <= date && guard++ < 2100) k++
  return { start: periodStart(cycle, k), end: addDays(periodStart(cycle, k + 1), -1) }
}

/**
 * The most recent period that has fully ended before `date`. A period whose
 * last day IS `date` only counts when `includeToday` is set (the manual
 * "New pay run" form uses that; the automatic period-end run does not, so it
 * never creates a run before the last day's hours have been worked).
 */
export function lastCompletedPeriod(cycle: PayCycle, date: string, includeToday = false): PayPeriod {
  const cur = periodContaining(cycle, date)
  if (cur.end < date || (includeToday && cur.end === date)) return cur
  const prevEnd = addDays(cur.start, -1)
  return periodContaining(cycle, prevEnd)
}

/** Days from `date` until the current period ends (0 = ends today). */
export function daysUntilPeriodEnd(cycle: PayCycle, date: string): number {
  const cur = periodContaining(cycle, date)
  const a = new Date(date + 'T00:00:00Z').getTime()
  const b = new Date(cur.end + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

export function frequencyLabel(f: PayFrequency): string {
  return f === 'weekly' ? 'Weekly' : f === 'monthly' ? 'Monthly' : 'Fortnightly'
}
