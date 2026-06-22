import type { PayBand, PayConfig } from './types.js';

/**
 * Default pay configuration matching PRD §9. These are DEFAULTS only — every
 * value is editable per business entity by an admin (overtime/weekend/PH rates
 * are contractual, not statutory, so they must never be hard-coded in logic).
 *
 *   Standard       hours 0–8    ×1.0
 *   Overtime T1    hours 8–10   ×1.5   (the 9th & 10th hour)
 *   Overtime T2    hours 10+    ×2.0   (the 11th hour onward)
 *   Saturday       all hours    ×1.5
 *   Sunday         all hours    ×2.0
 *   Public holiday all hours    ×2.5
 */
export const DEFAULT_PAY_CONFIG: PayConfig = {
  standardDailyHours: 8,
  weekdayTiers: [
    { band: 'regular', fromHour: 0, toHour: 8, multiplier: 1.0 },
    { band: 'overtime_t1', fromHour: 8, toHour: 10, multiplier: 1.5 },
    { band: 'overtime_t2', fromHour: 10, toHour: null, multiplier: 2.0 },
  ],
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2.0,
  publicHolidayMultiplier: 2.5,
};

/** All pay bands in display/report order. */
export const PAY_BANDS: PayBand[] = [
  'regular',
  'overtime_t1',
  'overtime_t2',
  'saturday',
  'sunday',
  'public_holiday',
];

/** Human-readable band labels (used in dashboard, payslip preview, Xero mapping). */
export const PAY_BAND_LABELS: Record<PayBand, string> = {
  regular: 'Ordinary',
  overtime_t1: 'Overtime 1.5×',
  overtime_t2: 'Overtime 2.0×',
  saturday: 'Saturday',
  sunday: 'Sunday',
  public_holiday: 'Public Holiday',
};

export const TIMESHEET_HOURS_MIN = 0.5;
export const TIMESHEET_HOURS_MAX = 24;
