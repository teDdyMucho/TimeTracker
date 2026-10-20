/**
 * Pure logic for offline clock-in / clock-out (PRD task "Offline capture and
 * reconnect sync"). No React Native or Supabase imports so it can be unit
 * tested with plain Node. The I/O lives in offline.ts.
 */
import type { ClockSession, WorkLocation } from './types'

export const LOCAL_ID_PREFIX = 'local-'

/** A queued item that keeps failing for a non-network reason is given up after this many tries. */
export const MAX_SYNC_ATTEMPTS = 20

/**
 * The server's nightly / 3:06 pm fallback closes a forgotten session as a
 * 7:00 am – 3:06 pm day (TV9). A queued clock-out only overrides that when it
 * looks like the automatic close; AUTO_CAP_HOURS is kept for older rows closed
 * under the previous 16-hour rule.
 */
export const AUTO_CAP_HOURS = 16

export interface QueuedClockIn {
  id: string
  kind: 'clock_in'
  /** When the worker tapped Confirm (ISO). Becomes clocked_in_at on sync. */
  at: string
  localSessionId: string
  input: {
    userId: string
    businessEntityId: string
    projectId: string
    workLocation: WorkLocation
    workDate: string
    lat: number | null
    lng: number | null
    address: string | null
    /** Selfie still on the phone; uploaded during sync. */
    selfieUri: string | null
    /** Selfie already uploaded before the connection dropped. */
    selfieUrl: string | null
  }
  /** Failed sync attempts so far (non-network errors only). */
  attempts?: number
}

export interface QueuedClockOut {
  id: string
  kind: 'clock_out'
  /** When the worker tapped Clock Out (ISO). Becomes clocked_out_at on sync. */
  at: string
  userId: string
  /** Server id, or a local-… id when the clock-in is also still queued. */
  sessionId: string
  overtimeRequested: boolean
  overtimeReason: string | null
  /** TV3: approver the worker picked. */
  approverId?: string | null
  attempts?: number
}

export type OfflineOp = QueuedClockIn | QueuedClockOut

/** An item the phone gave up on; shown on Home so the worker can tell the office. */
export interface FailedOp {
  id: string
  kind: OfflineOp['kind']
  at: string
  userId: string
  reason: string
  failedAt: string
}

export function opUserId(op: OfflineOp): string {
  return op.kind === 'clock_in' ? op.input.userId : op.userId
}

export function isLocalId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(LOCAL_ID_PREFIX)
}

export function newLocalId(): string {
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return `${LOCAL_ID_PREFIX}${rand}`
}

/**
 * True for the errors fetch / Supabase raise when there is no connectivity
 * (as opposed to a server-side answer, which is handled by isPermanentError).
 */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false
  const anyE = e as { name?: string; message?: string; code?: string; details?: string; status?: number }
  if (anyE.name === 'AbortError') return true
  const text = `${anyE.message ?? ''} ${anyE.details ?? ''} ${anyE.code ?? ''}`.toLowerCase()
  return (
    text.includes('network request failed') ||
    text.includes('failed to fetch') ||
    text.includes('fetch failed') ||
    text.includes('network error') ||
    text.includes('internet') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('socket') ||
    text.includes('unable to resolve host') ||
    text.includes('typeerror: network')
  )
}

/**
 * Errors the server will give every time, so retrying cannot help: bad data,
 * a constraint, a trigger's RAISE, a missing row. Everything else (5xx during
 * an outage, an expired token that has not refreshed yet, a captive portal's
 * HTML) is treated as temporary and retried, up to MAX_SYNC_ATTEMPTS.
 */
export function isPermanentError(e: unknown): boolean {
  if (!e) return false
  const anyE = e as { code?: string | number }
  const code = String(anyE.code ?? '')
  if (/^(22|23)\d{3}$/.test(code)) return true // data exception / integrity constraint
  return code === 'P0001' || code === 'PGRST116' || code === 'PGRST102' || code === 'PGRST204'
}

/** A ClockSession-shaped object so the Home screen can show a queued clock-in as "on the clock". */
export function buildLocalSession(op: QueuedClockIn): ClockSession {
  return {
    id: op.localSessionId,
    profile_id: op.input.userId,
    business_entity_id: op.input.businessEntityId,
    project_id: op.input.projectId,
    work_location: op.input.workLocation,
    work_date: op.input.workDate,
    clocked_in_at: op.at,
    clocked_out_at: null,
    clock_in_lat: op.input.lat,
    clock_in_lng: op.input.lng,
    selfie_url: op.input.selfieUrl,
    overtime_requested: false,
    overtime_reason: null,
  }
}

/** After a queued clock-in syncs, point any later queued clock-out at the real session id. */
export function relinkQueue(queue: OfflineOp[], localSessionId: string, serverId: string): OfflineOp[] {
  return queue.map((op) =>
    op.kind === 'clock_out' && op.sessionId === localSessionId ? { ...op, sessionId: serverId } : op,
  )
}

/** The session the Home screen should show while the queue is not empty, if any. */
export function pendingSessionFromQueue(queue: OfflineOp[]): ClockSession | null {
  // The last clock-in that has no clock-out after it is still "on the clock".
  let open: QueuedClockIn | null = null
  for (const op of queue) {
    if (op.kind === 'clock_in') open = op
    else if (op.kind === 'clock_out' && open && op.sessionId === open.localSessionId) open = null
  }
  return open ? buildLocalSession(open) : null
}

/** True when the queue already holds a clock-out for this session (local or server id). */
export function hasQueuedClockOut(queue: OfflineOp[], sessionId: string): boolean {
  return queue.some((op) => op.kind === 'clock_out' && op.sessionId === sessionId)
}

/**
 * What Home should show as "on the clock": the server's (or cached) open
 * session unless a clock-out for it is already waiting in the queue, in which
 * case only a later queued clock-in (if any) counts.
 */
export function resolveShownSession(queue: OfflineOp[], session: ClockSession | null): ClockSession | null {
  const pending = pendingSessionFromQueue(queue)
  if (session && hasQueuedClockOut(queue, session.id)) return pending
  return session ?? pending
}

/**
 * Decide the real clock-out time when the server already closed the session.
 * Only the automatic 16-hour cap is overridden (the worker's actual tap wins
 * when it is earlier); a session closed by a person — an admin edit or the
 * worker on another device — is left alone.
 */
export function reconcileClockOut(
  server: { clocked_in_at: string; clocked_out_at: string | null; auto_closed?: boolean | null },
  queuedAt: string,
  capHours = AUTO_CAP_HOURS,
): string | null {
  if (!server.clocked_out_at) return queuedAt
  const inMs = Date.parse(server.clocked_in_at)
  const outMs = Date.parse(server.clocked_out_at)
  const qMs = Date.parse(queuedAt)
  if ([inMs, outMs, qMs].some(Number.isNaN)) return null
  const isAutoCap = server.auto_closed === true || Math.abs(outMs - (inMs + capHours * 3_600_000)) <= 90_000
  if (!isAutoCap) return null
  return qMs > inMs && qMs < outMs ? queuedAt : null
}

export function describeQueue(queue: OfflineOp[]): string {
  const ins = queue.filter((o) => o.kind === 'clock_in').length
  const outs = queue.filter((o) => o.kind === 'clock_out').length
  const parts = []
  if (ins) parts.push(`${ins} clock-in${ins > 1 ? 's' : ''}`)
  if (outs) parts.push(`${outs} clock-out${outs > 1 ? 's' : ''}`)
  return parts.join(' and ')
}
