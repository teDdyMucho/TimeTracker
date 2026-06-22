/** Local-calendar date helpers (no UTC drift — timesheets are calendar days). */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** ISO date (YYYY-MM-DD) for a Date in local time. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toISODate(dt);
}

/** Monday-based start of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -dow);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Friendly label like "Mon 22 Jun" (or "Today" / "Yesterday"). */
export function friendlyDate(iso: string): string {
  if (iso === todayISO()) return 'Today';
  if (iso === addDays(todayISO(), -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAY_NAMES[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}
