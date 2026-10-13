/**
 * Pure helpers behind the clock-in / clock-out confirmations (PRD §7) and the
 * project search box. Kept free of React Native imports so they can be unit
 * tested with plain Node.
 */

export interface SearchableProject {
  id: string
  name: string
  client?: string | null
}

/** Case-insensitive match on project name or client. Empty query = all. */
export function filterProjects<T extends SearchableProject>(projects: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return projects
  return projects.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.client ?? '').toLowerCase().includes(q),
  )
}

/** Show the search box only when the list is long enough to need one. */
export const PROJECT_SEARCH_THRESHOLD = 4
export function shouldShowProjectSearch(count: number): boolean {
  return count > PROJECT_SEARCH_THRESHOLD
}

/** "7h 36m" / "45 min" from a clock-in timestamp to now. Never negative. */
export function workedLabel(clockedInAt: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(clockedInAt).getTime()) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export function clockInMessage(projectName: string | null | undefined): { title: string; body: string } {
  return {
    title: 'Clocked in',
    body: `You're on the clock for ${projectName || 'your project'}. Remember to clock out when you finish.`,
  }
}

export function clockOutMessage(worked: string, overtimeRequested: boolean): { title: string; body: string } {
  return {
    title: 'Timesheet submitted',
    body: overtimeRequested
      ? `${worked} logged. Your overtime request has been sent to your supervisor for approval.`
      : `${worked} logged for today. It will be paid once your supervisor approves it.`,
  }
}
