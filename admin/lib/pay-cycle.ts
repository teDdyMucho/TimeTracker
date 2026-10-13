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

function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

export interface PayPeriod { start: string; end: string }

/**
 * The pay period containing `date`, walking forward/back from the anchor.
 * Periods are inclusive of both ends.
 */
export function periodContaining(cycle: PayCycle, date: string): PayPeriod {
  let start = cycle.anchorStart
  const next = (s: string) =>
    cycle.frequency === 'weekly' ? addDays(s, 7) : cycle.frequency === 'fortnightly' ? addDays(s, 14) : addMonths(s, 1)
  const prev = (s: string) =>
    cycle.frequency === 'weekly' ? addDays(s, -7) : cycle.frequency === 'fortnightly' ? addDays(s, -14) : addMonths(s, -1)

  // Guard against runaway loops on absurd anchors (max ~40 years either way).
  let guard = 0
  while (start > date && guard++ < 2100) start = prev(start)
  guard = 0
  while (next(start) <= date && guard++ < 2100) start = next(start)
  return { start, end: addDays(next(start), -1) }
}

/** The most recent period that has fully ended on or before `date`. */
export function lastCompletedPeriod(cycle: PayCycle, date: string): PayPeriod {
  const cur = periodContaining(cycle, date)
  if (cur.end <= date) return cur
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
