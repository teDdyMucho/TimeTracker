/** Convert decimal hours (e.g. 0.5, 1.75) to a human-readable string: "30 min", "1h 45m" */
export function formatHours(hours: number | string | null | undefined): string {
  if (hours == null) return '—'
  const totalMins = Math.round(Number(hours) * 60)
  if (totalMins === 0) return '0 min'
  if (totalMins < 60) return `${totalMins} min`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
