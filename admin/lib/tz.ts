/**
 * The business runs on Melbourne time (the sites are in Victoria), which
 * observes daylight saving — UTC+10 in winter, UTC+11 from the first Sunday of
 * October. Everything the dashboard shows or accepts is in this zone, wherever
 * the admin is sitting: an admin in Manila typing "7:00 AM" means 7:00 AM on
 * site, not 7:00 AM in Manila.
 */
export const APP_TZ = 'Australia/Melbourne'

const pad = (n: number) => String(n).padStart(2, '0')

/** Wall-clock parts of an instant, as seen in APP_TZ. */
function zonedParts(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

/** APP_TZ's offset from UTC at a given instant, in ms (e.g. +11h during DST). */
function offsetMs(instant: Date): number {
  const p = zonedParts(instant)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant.getTime() / 1000) * 1000
}

/** ISO (UTC) instant → 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">, in APP_TZ. */
export function isoToZonedInput(iso: string): string {
  const p = zonedParts(new Date(iso))
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}

/** 'YYYY-MM-DDTHH:mm' typed as APP_TZ wall-clock time → ISO (UTC). Empty → ''. */
export function zonedInputToIso(local: string): string {
  if (!local) return ''
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return ''
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // The offset depends on the instant, which is what we're solving for: guess
  // with the offset at the wall time, then correct once (handles DST changeover).
  let utc = wall - offsetMs(new Date(wall))
  utc = wall - offsetMs(new Date(utc))
  return new Date(utc).toISOString()
}

/** Today's calendar date in APP_TZ, 'YYYY-MM-DD'. */
export function todayInAppTz(): string {
  const p = zonedParts(new Date())
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}
