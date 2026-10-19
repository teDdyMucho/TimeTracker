/**
 * Offline clock-in / clock-out queue (PRD task "Offline capture and reconnect
 * sync"). When the phone has no connection, Clock In / Clock Out are saved
 * here with the real tap time and replayed, in order, the next time the app
 * is online (on launch, on return to the foreground, on Home refresh, and on
 * a 30-second timer while anything is waiting). The selfie is copied into the
 * app's documents folder and uploaded during sync.
 *
 * Every change to the queue goes through one lock and removes items by id, so
 * a Clock Out tapped while a sync is running can never be lost. The queue is
 * shared storage but every item carries its user id: only the signed-in
 * worker's items are shown and sent.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { uploadSelfie } from './queries';
import {
  MAX_SYNC_ATTEMPTS,
  isLocalId, isNetworkError, isPermanentError, newLocalId, opUserId, relinkQueue,
  pendingSessionFromQueue, reconcileClockOut,
  type FailedOp, type OfflineOp, type QueuedClockIn, type QueuedClockOut,
} from './offline-core';
import type { ClockSession } from './types';

const QUEUE_KEY = 'timevera.offlineQueue';
const FAILED_KEY = 'timevera.offlineFailed';
const ID_MAP_KEY = 'timevera.offlineIdMap';
const sessionKey = (userId: string) => `timevera.activeSession.${userId}`;
const SELFIE_DIR = `${FileSystem.documentDirectory ?? ''}offline-selfies/`;

// ── Storage (one lock for every write) ───────────────────────────────────────

let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function readAll(): Promise<OfflineOp[]> {
  const parsed = await readJson<unknown>(QUEUE_KEY, []);
  return Array.isArray(parsed) ? (parsed as OfflineOp[]) : [];
}

/** The signed-in worker's queued items, oldest first (all items when no user is given). */
export async function readQueue(userId?: string): Promise<OfflineOp[]> {
  const all = await readAll();
  return userId ? all.filter((op) => opUserId(op) === userId) : all;
}

async function mutateQueue(fn: (all: OfflineOp[]) => OfflineOp[]): Promise<OfflineOp[]> {
  return withLock(async () => {
    const next = fn(await readAll());
    await writeJson(QUEUE_KEY, next);
    return next;
  });
}

// ── Last known server session (so a restart with no signal still shows "on the clock") ──

export async function cacheActiveSession(userId: string, session: ClockSession | null): Promise<void> {
  try {
    if (session && !isLocalId(session.id)) await writeJson(sessionKey(userId), session);
    else await AsyncStorage.removeItem(sessionKey(userId));
  } catch {
    // best effort
  }
}

export async function readCachedSession(userId: string): Promise<ClockSession | null> {
  const s = await readJson<ClockSession | null>(sessionKey(userId), null);
  return s && s.profile_id === userId ? s : null;
}

// ── Items the phone gave up on ───────────────────────────────────────────────

export async function readFailed(userId: string): Promise<FailedOp[]> {
  const all = await readJson<FailedOp[]>(FAILED_KEY, []);
  return Array.isArray(all) ? all.filter((f) => f.userId === userId) : [];
}

export async function clearFailed(userId: string): Promise<void> {
  await withLock(async () => {
    const all = await readJson<FailedOp[]>(FAILED_KEY, []);
    await writeJson(FAILED_KEY, (Array.isArray(all) ? all : []).filter((f) => f.userId !== userId));
  });
}

async function addFailed(op: OfflineOp, reason: string): Promise<void> {
  await withLock(async () => {
    const all = await readJson<FailedOp[]>(FAILED_KEY, []);
    const next: FailedOp[] = [
      ...(Array.isArray(all) ? all : []),
      { id: op.id, kind: op.kind, at: op.at, userId: opUserId(op), reason: reason.slice(0, 300), failedAt: new Date().toISOString() },
    ];
    await writeJson(FAILED_KEY, next.slice(-20));
  });
}

// ── Selfie kept on the phone until it is uploaded ────────────────────────────

/** Copy the camera's cache file somewhere the OS will not purge. Falls back to the original URI. */
async function keepSelfie(opId: string, uri: string): Promise<string> {
  try {
    if (!FileSystem.documentDirectory) return uri;
    await FileSystem.makeDirectoryAsync(SELFIE_DIR, { intermediates: true });
    const dest = `${SELFIE_DIR}${opId}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

async function selfieExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return true; // unknown: let the upload decide
  }
}

async function dropSelfie(uri: string): Promise<void> {
  if (!uri.startsWith(SELFIE_DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Quick reachability check: any HTTP answer from Supabase counts as online.
 * The first request after signal returns pays for DNS + TLS on a slow link,
 * so the timeout is generous; it is only on the sync path and the
 * no-signal fallback, never on an ordinary online clock-in.
 */
export async function probeOnline(timeoutMs = 5000): Promise<boolean> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return true;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${url}/auth/v1/health`, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** The queued session the worker is currently "on the clock" for, if any. */
export async function getPendingSession(userId: string): Promise<ClockSession | null> {
  return pendingSessionFromQueue(await readQueue(userId));
}

export async function queueClockIn(input: QueuedClockIn['input']): Promise<ClockSession> {
  const op: QueuedClockIn = {
    id: newLocalId(),
    kind: 'clock_in',
    at: new Date().toISOString(),
    localSessionId: newLocalId(),
    input: { ...input },
  };
  if (op.input.selfieUri && !op.input.selfieUrl) op.input.selfieUri = await keepSelfie(op.id, op.input.selfieUri);
  const all = await mutateQueue((q) => [...q, op]);
  return pendingSessionFromQueue(all.filter((o) => opUserId(o) === input.userId))!;
}

export async function queueClockOut(input: Omit<QueuedClockOut, 'id' | 'kind' | 'at' | 'attempts'>): Promise<void> {
  const op: QueuedClockOut = { id: newLocalId(), kind: 'clock_out', at: new Date().toISOString(), ...input };
  await mutateQueue((q) => [...q, op]);
  // The server session (if that is what was closed) is no longer "open" on this phone.
  if (!isLocalId(input.sessionId)) await cacheActiveSession(input.userId, null);
}

export interface FlushResult { synced: number; remaining: number; error?: string }

let inflight: Promise<FlushResult> | null = null;

/**
 * Replay the signed-in worker's queue against the server, oldest first.
 * Stops at the first network failure (keeping everything for later). A
 * server rejection that cannot change on retry drops the item into the
 * "failed" list, which Home shows; a temporary error is retried later, up
 * to MAX_SYNC_ATTEMPTS. Concurrent callers share one run.
 */
export function flushQueue(userId: string): Promise<FlushResult> {
  if (inflight) return inflight;
  inflight = doFlush(userId).finally(() => { inflight = null; });
  return inflight;
}

async function doFlush(userId: string): Promise<FlushResult> {
  let synced = 0;
  let lastError: string | undefined;
  const first = await readQueue(userId);
  if (first.length === 0) return { synced: 0, remaining: 0 };
  if (!(await probeOnline())) return { synced: 0, remaining: first.length, error: 'offline' };

  const idMap = await readJson<Record<string, string>>(ID_MAP_KEY, {});
  const removeOp = (id: string) => mutateQueue((all) => all.filter((o) => o.id !== id));

  // Each loop re-reads storage so items queued meanwhile are seen and nothing
  // is overwritten. The guard only protects against a storage write that
  // keeps failing.
  for (let guard = 0; guard < first.length * 2 + 5; guard++) {
    const op = (await readQueue(userId))[0];
    if (!op) break;
    try {
      if (op.kind === 'clock_in') {
        let selfieUrl = op.input.selfieUrl;
        const uri = op.input.selfieUri;
        if (!selfieUrl && uri && (await selfieExists(uri))) {
          // A network error here propagates (keep the item); an HTTP rejection
          // returns null and the clock-in goes in without a photo.
          selfieUrl = await uploadSelfie(op.input.userId, uri, { throwOnNetwork: true });
        }
        const { data, error } = await supabase
          .from('clock_sessions')
          .insert({
            profile_id: op.input.userId,
            business_entity_id: op.input.businessEntityId,
            project_id: op.input.projectId,
            work_location: op.input.workLocation,
            work_date: op.input.workDate,
            clocked_in_at: op.at,
            clock_in_lat: op.input.lat,
            clock_in_lng: op.input.lng,
            selfie_url: selfieUrl,
            clock_in_address: op.input.address,
          })
          .select('id')
          .single();
        if (error) throw error;
        const serverId = data.id as string;
        idMap[op.localSessionId] = serverId;
        await writeJson(ID_MAP_KEY, idMap);
        await mutateQueue((all) => relinkQueue(all.filter((o) => o.id !== op.id), op.localSessionId, serverId));
        if (uri) await dropSelfie(uri);
        synced++;
      } else {
        const sessionId = isLocalId(op.sessionId) ? (idMap[op.sessionId] ?? op.sessionId) : op.sessionId;
        if (isLocalId(sessionId)) {
          // Its clock-in never reached the server (that failure is already in
          // the failed list) — there is nothing to close.
          await removeOp(op.id);
          continue;
        }
        const { data: closed, error } = await supabase
          .from('clock_sessions')
          .update({
            clocked_out_at: op.at,
            overtime_requested: op.overtimeRequested,
            overtime_reason: op.overtimeReason,
          })
          .eq('id', sessionId)
          .is('clocked_out_at', null)
          .select('id');
        if (error) throw error;
        if (!closed || closed.length === 0) {
          // Already closed server-side. If that was the automatic 16-hour cap
          // and nobody has reviewed it yet, the worker's real time replaces it.
          const { data: s, error: sErr } = await supabase
            .from('clock_sessions')
            .select('clocked_in_at, clocked_out_at, review_status')
            .eq('id', sessionId)
            .maybeSingle();
          if (sErr) throw sErr;
          if (s && s.review_status === 'pending') {
            const fixed = reconcileClockOut({ clocked_in_at: s.clocked_in_at, clocked_out_at: s.clocked_out_at }, op.at);
            if (fixed) {
              const { error: fixErr } = await supabase
                .from('clock_sessions')
                .update({ clocked_out_at: fixed, overtime_requested: op.overtimeRequested, overtime_reason: op.overtimeReason })
                .eq('id', sessionId);
              if (fixErr) throw fixErr;
            }
          }
        }
        if (op.overtimeRequested) {
          const { data: ts, error: tsErr } = await supabase
            .from('timesheets')
            .select('id')
            .eq('clock_session_id', sessionId)
            .maybeSingle();
          if (tsErr) throw tsErr;
          if (ts) {
            const { data: existing } = await supabase
              .from('overtime_requests')
              .select('id')
              .eq('timesheet_id', ts.id)
              .limit(1);
            if (!existing || existing.length === 0) {
              const { error: otErr } = await supabase.from('overtime_requests').insert({
                timesheet_id: ts.id,
                profile_id: op.userId,
                reason: op.overtimeReason ?? '',
                status: 'pending',
              });
              if (otErr) throw otErr;
            }
          }
        }
        await removeOp(op.id);
        synced++;
      }
    } catch (e) {
      if (isNetworkError(e)) {
        lastError = 'offline';
        break; // keep everything; try again later
      }
      const reason = e instanceof Error ? e.message : String(e);
      const attempts = (op.attempts ?? 0) + 1;
      lastError = reason;
      if (isPermanentError(e) || attempts >= MAX_SYNC_ATTEMPTS) {
        console.warn('[offline] giving up on', op.kind, reason);
        await removeOp(op.id);
        await addFailed(op, reason);
        continue; // the rest of the queue can still sync
      }
      // Temporary (outage, token not refreshed yet, captive portal): note the
      // attempt and retry the whole queue later, in order.
      await mutateQueue((all) => all.map((o) => (o.id === op.id ? { ...o, attempts } : o)));
      break;
    }
  }
  const remaining = (await readQueue(userId)).length;
  return { synced, remaining, error: lastError };
}
