/** Format decimal hours as "8h 30m" / "30m" / "8h" — never "8.5 h". */
export function formatHours(hours: number): string {
  const totalMin = Math.round(Number(hours) * 60)
  if (totalMin <= 0) return '0h'
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Short clock time like "4:51 am". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}
