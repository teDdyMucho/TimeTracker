/**
 * Labour-cost / overtime engine (PRD §9, §11, §15).
 *
 * Pure, deterministic, backend-agnostic. The same code computes:
 *   - project/employee/entity/location labour cost (dashboard & reporting), and
 *   - the per-band hours & gross pay that drive the fortnightly Xero pay run.
 *
 * Design notes:
 *  - Overtime is a function of an employee's TOTAL hours on a day, across all
 *    projects and both business entities (same person, same day, same rate).
 *    Bands are computed on the daily total, then the cost is allocated back to
 *    each timesheet entry in proportion to its hours, so the overtime premium is
 *    shared fairly across the projects/entities worked that day.
 *  - Saturday/Sunday/public-holiday days use a single whole-day multiplier; only
 *    ordinary weekdays use the tier ladder. (Configurable — see PayConfig.)
 */
import type {
  DayType,
  PayBand,
  PayConfig,
  WorkLocation,
} from './types.js';
import { PAY_BANDS } from './constants.js';

// ─── Money helpers ─────────────────────────────────────────────────────────

/** Round to cents, avoiding binary-float artefacts (e.g. 1.005 → 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

// ─── Day classification ──────────────────────────────────────────────────

/**
 * Classify a day. A public holiday always wins; otherwise weekend by weekday.
 * The ISO date is parsed as a local calendar date to avoid timezone drift.
 */
export function classifyDay(dateISO: string, isPublicHoliday: boolean): DayType {
  if (isPublicHoliday) return 'public_holiday';
  const [y, m, d] = dateISO.split('-').map(Number);
  const dow = new Date(y!, m! - 1, d!).getDay(); // 0 = Sun … 6 = Sat
  if (dow === 6) return 'saturday';
  if (dow === 0) return 'sunday';
  return 'weekday';
}

// ─── Band breakdown for a single day ───────────────────────────────────────

export interface BandHours {
  band: PayBand;
  multiplier: number;
  hours: number;
}

/** Split a day's total hours into pay bands per the configured rules. */
export function bandsForDay(
  totalHours: number,
  dayType: DayType,
  config: PayConfig,
): BandHours[] {
  if (totalHours <= 0) return [];

  if (dayType === 'weekday') {
    const out: BandHours[] = [];
    for (const tier of config.weekdayTiers) {
      const upper = tier.toHour ?? Infinity;
      const hours = Math.max(0, Math.min(totalHours, upper) - tier.fromHour);
      if (hours > 0) {
        out.push({ band: tier.band, multiplier: tier.multiplier, hours: round2(hours) });
      }
    }
    return out;
  }

  const multiplier =
    dayType === 'saturday'
      ? config.saturdayMultiplier
      : dayType === 'sunday'
        ? config.sundayMultiplier
        : config.publicHolidayMultiplier;

  return [{ band: dayType, multiplier, hours: round2(totalHours) }];
}

// ─── Per-day computation ─────────────────────────────────────────────────

export interface DayEntryInput {
  projectId: string;
  businessEntityId: string;
  workLocation: WorkLocation;
  hours: number;
}

export interface BandResult extends BandHours {
  cost: number;
}

export interface EntryAllocation {
  projectId: string;
  businessEntityId: string;
  workLocation: WorkLocation;
  hours: number;
  cost: number;
}

export interface DayResult {
  date: string;
  dayType: DayType;
  totalHours: number;
  bands: BandResult[];
  gross: number;
  allocations: EntryAllocation[];
}

/**
 * Compute a single employee-day: band breakdown, gross, and per-entry cost
 * allocation. `hourlyRate` is the cost rate used for costing (or pay rate for
 * payroll) — the caller decides which to pass.
 */
export function computeDay(
  date: string,
  entries: DayEntryInput[],
  hourlyRate: number,
  config: PayConfig,
  isPublicHoliday = false,
): DayResult {
  const totalHours = round2(sum(entries.map((e) => e.hours)));
  const dayType = classifyDay(date, isPublicHoliday);

  const bands: BandResult[] = bandsForDay(totalHours, dayType, config).map((b) => ({
    ...b,
    cost: round2(b.hours * hourlyRate * b.multiplier),
  }));
  const gross = round2(sum(bands.map((b) => b.cost)));

  const allocations = allocate(entries, totalHours, gross);
  return { date, dayType, totalHours, bands, gross, allocations };
}

/** Allocate the day's gross to each entry in proportion to its hours. */
function allocate(
  entries: DayEntryInput[],
  totalHours: number,
  gross: number,
): EntryAllocation[] {
  const allocations: EntryAllocation[] = entries.map((e) => ({
    projectId: e.projectId,
    businessEntityId: e.businessEntityId,
    workLocation: e.workLocation,
    hours: round2(e.hours),
    cost: totalHours > 0 ? round2((gross * e.hours) / totalHours) : 0,
  }));

  // Push any rounding drift onto the largest entry so the parts sum to gross.
  const drift = round2(gross - sum(allocations.map((a) => a.cost)));
  if (drift !== 0 && allocations.length > 0) {
    let idx = 0;
    for (let i = 1; i < allocations.length; i++) {
      if (allocations[i]!.hours > allocations[idx]!.hours) idx = i;
    }
    allocations[idx]!.cost = round2(allocations[idx]!.cost + drift);
  }
  return allocations;
}

// ─── Period aggregation (pay period / report range) ──────────────────────

export interface Bucket {
  hours: number;
  cost: number;
}

export interface PeriodDayInput {
  date: string;
  entries: DayEntryInput[];
}

export interface PeriodResult {
  totalHours: number;
  gross: number;
  byBand: Record<PayBand, Bucket>;
  byProject: Record<string, Bucket>;
  byEntity: Record<string, Bucket>;
  byLocation: Record<WorkLocation, Bucket>;
  days: DayResult[];
}

function emptyBuckets(): Record<PayBand, Bucket> {
  return Object.fromEntries(PAY_BANDS.map((b) => [b, { hours: 0, cost: 0 }])) as Record<
    PayBand,
    Bucket
  >;
}

function add(map: Record<string, Bucket>, key: string, hours: number, cost: number): void {
  const cur = map[key] ?? { hours: 0, cost: 0 };
  map[key] = { hours: round2(cur.hours + hours), cost: round2(cur.cost + cost) };
}

/**
 * Aggregate many employee-days into a period: totals, and breakdowns by band
 * (→ Xero earnings lines), project, business entity, and site-vs-workshop.
 */
export function computePeriod(
  days: PeriodDayInput[],
  hourlyRate: number,
  config: PayConfig,
  isPublicHoliday: (dateISO: string) => boolean = () => false,
): PeriodResult {
  const dayResults = days.map((d) =>
    computeDay(d.date, d.entries, hourlyRate, config, isPublicHoliday(d.date)),
  );

  const byBand = emptyBuckets();
  const byProject: Record<string, Bucket> = {};
  const byEntity: Record<string, Bucket> = {};
  const byLocation: Record<WorkLocation, Bucket> = {
    site: { hours: 0, cost: 0 },
    workshop: { hours: 0, cost: 0 },
  };

  for (const day of dayResults) {
    for (const b of day.bands) {
      byBand[b.band] = {
        hours: round2(byBand[b.band].hours + b.hours),
        cost: round2(byBand[b.band].cost + b.cost),
      };
    }
    for (const a of day.allocations) {
      add(byProject, a.projectId, a.hours, a.cost);
      add(byEntity, a.businessEntityId, a.hours, a.cost);
      byLocation[a.workLocation] = {
        hours: round2(byLocation[a.workLocation].hours + a.hours),
        cost: round2(byLocation[a.workLocation].cost + a.cost),
      };
    }
  }

  return {
    totalHours: round2(sum(dayResults.map((d) => d.totalHours))),
    gross: round2(sum(dayResults.map((d) => d.gross))),
    byBand,
    byProject,
    byEntity,
    byLocation,
    days: dayResults,
  };
}

// ─── Payroll mapping (PRD §15/§16) ─────────────────────────────────────────

export interface PayrollBreakdown {
  bandHours: Record<PayBand, number>;
  bandCost: Record<PayBand, number>;
  grossPay: number;
}

/** Reduce a period to the per-band hours/cost a Xero pay run needs. */
export function payrollBreakdown(period: PeriodResult): PayrollBreakdown {
  const bandHours = {} as Record<PayBand, number>;
  const bandCost = {} as Record<PayBand, number>;
  for (const band of PAY_BANDS) {
    bandHours[band] = period.byBand[band].hours;
    bandCost[band] = period.byBand[band].cost;
  }
  return { bandHours, bandCost, grossPay: period.gross };
}
