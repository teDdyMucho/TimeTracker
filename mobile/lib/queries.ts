import { supabase } from './supabase';
import type { BusinessEntity, ClockSession, Profile, Project, Timesheet, TimesheetLine, WorkLocation } from './types';
import { startOfWeek, todayISO } from './date';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, business_access, expo_push_token, avatar_url, notifications_enabled')
    .eq('id', userId)
    .single();
  if (error) {
    console.warn('[queries] fetchProfile', error.message);
    return null;
  }
  return data as Profile;
}

export async function fetchBusinessEntities(ids: string[]): Promise<BusinessEntity[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('business_entities')
    .select('id, name')
    .in('id', ids)
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return (data ?? []) as BusinessEntity[];
}

export async function fetchProjects(businessEntityId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client, business_entity_id')
    .eq('business_entity_id', businessEntityId)
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function fetchTimesheetsBetween(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<Timesheet[]> {
  const { data, error } = await supabase
    .from('timesheets')
    .select('*')
    .eq('profile_id', userId)
    .gte('work_date', fromISO)
    .lte('work_date', toISO)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Timesheet[];
}

export async function fetchRecentTimesheets(userId: string, limit = 20): Promise<Timesheet[]> {
  const { data, error } = await supabase
    .from('timesheets')
    .select('*')
    .eq('profile_id', userId)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Timesheet[];
}

export interface HomeSummary {
  todayHours: number;
  weekHours: number;
  pendingOvertime: number;
}

export async function fetchHomeSummary(userId: string): Promise<HomeSummary> {
  const today = todayISO();
  const weekStart = startOfWeek(today);
  const rows = await fetchTimesheetsBetween(userId, weekStart, today);
  return {
    todayHours: round2(rows.filter((r) => r.work_date === today).reduce((s, r) => s + Number(r.hours), 0)),
    weekHours: round2(rows.reduce((s, r) => s + Number(r.hours), 0)),
    pendingOvertime: rows.filter((r) => r.overtime_status === 'pending').length,
  };
}

export interface SubmitTimesheetInput {
  userId: string;
  workDate: string;
  businessEntityId: string;
  lines: TimesheetLine[];
  overtimeRequested: boolean;
  overtimeReason: string | null;
}

/** Insert one timesheet row per line; create OT requests when flagged. */
export async function submitTimesheets(input: SubmitTimesheetInput): Promise<void> {
  const rows = input.lines
    .filter((l) => l.projectId && l.hours > 0)
    .map((l) => ({
      profile_id: input.userId,
      work_date: input.workDate,
      business_entity_id: input.businessEntityId,
      project_id: l.projectId,
      work_location: l.workLocation,
      hours: l.hours,
      overtime_requested: input.overtimeRequested,
      overtime_reason: input.overtimeRequested ? input.overtimeReason : null,
      overtime_status: input.overtimeRequested ? 'pending' : 'none',
      status: 'submitted',
    }));

  if (rows.length === 0) throw new Error('Add at least one project with hours.');

  const { data, error } = await supabase.from('timesheets').insert(rows).select('id');
  if (error) throw error;

  if (input.overtimeRequested && data) {
    const otRows = data.map((t) => ({
      timesheet_id: t.id,
      profile_id: input.userId,
      reason: input.overtimeReason ?? '',
      status: 'pending' as const,
    }));
    const { error: otError } = await supabase.from('overtime_requests').insert(otRows);
    if (otError) throw otError;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── Clock In / Clock Out ─────────────────────────────────────────────────────

export async function fetchActiveSession(userId: string): Promise<ClockSession | null> {
  const { data, error } = await supabase
    .from('clock_sessions')
    .select('*')
    .eq('profile_id', userId)
    .is('clocked_out_at', null)
    .order('clocked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ClockSession | null;
}

/** All clock-in sessions for a user (newest first) — used to show daily selfies/photos. */
export async function fetchClockSessions(userId: string, limit = 100): Promise<ClockSession[]> {
  const { data, error } = await supabase
    .from('clock_sessions')
    .select('*')
    .eq('profile_id', userId)
    .order('clocked_in_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ClockSession[];
}

export async function uploadSelfie(userId: string, uri: string): Promise<string | null> {
  try {
    const fileName = `${Date.now()}.jpg`;
    const storagePath = `${userId}/${fileName}`;

    // Get JWT — required for the storage RLS INSERT policy
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      console.error('[selfie] no active session');
      return null;
    }

    // FormData with { uri, name, type } is the ONLY reliable way to upload
    // files in React Native — fetch(uri).blob() silently fails on Android.
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: 'image/jpeg',
    } as any);

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/selfies/${storagePath}`;

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-upsert': 'false',
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[selfie] upload HTTP error:', res.status, body);
      return null;
    }

    const { data } = supabase.storage.from('selfies').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (e) {
    console.error('[selfie] exception:', String(e));
    return null;
  }
}

/** Upload a profile photo to the avatars bucket and return its public URL. */
export async function uploadAvatar(userId: string, uri: string): Promise<string | null> {
  try {
    const fileName = `${Date.now()}.jpg`;
    const storagePath = `${userId}/${fileName}`;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;

    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'image/jpeg' } as any);

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${storagePath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      body: formData,
    });
    if (!res.ok) {
      console.error('[avatar] upload error:', res.status, await res.text());
      return null;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (e) {
    console.error('[avatar] exception:', String(e));
    return null;
  }
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, read, created_at')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .eq('read', false);
  return count ?? 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('profile_id', userId).eq('read', false);
}

// ── Messages (two-way chat with Admin) ────────────────────────────────────────
export interface ChatMessage {
  id: string;
  body: string;
  sender_role: 'admin' | 'employee';
  read: boolean;
  created_at: string;
}

/** All messages in the signed-in user's thread (oldest → newest). */
export async function fetchMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, sender_role, read, created_at')
    .eq('profile_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

/** Employee sends a message to Admin (their own thread). */
export async function sendMessage(userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    profile_id: userId,
    sender_id: userId,
    sender_role: 'employee',
    body: body.trim(),
  });
  if (error) throw error;
}

/** Count of unread admin messages for the badge. */
export async function fetchUnreadMessageCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .eq('sender_role', 'admin')
    .eq('read', false);
  return count ?? 0;
}

/** Mark admin messages as read when the employee opens the chat. */
export async function markMessagesRead(userId: string): Promise<void> {
  await supabase.from('messages').update({ read: true })
    .eq('profile_id', userId).eq('sender_role', 'admin').eq('read', false);
}

/** Update editable fields on the signed-in user's own profile. */
export async function updateMyProfile(
  userId: string,
  patch: { avatar_url?: string; notifications_enabled?: boolean },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

export interface ClockInInput {
  userId: string;
  businessEntityId: string;
  projectId: string;
  workLocation: WorkLocation;
  workDate: string;
  lat: number | null;
  lng: number | null;
  selfieUrl: string | null;
  address: string | null;
}

export async function clockIn(input: ClockInInput): Promise<void> {
  const { error } = await supabase.from('clock_sessions').insert({
    profile_id: input.userId,
    business_entity_id: input.businessEntityId,
    project_id: input.projectId,
    work_location: input.workLocation,
    work_date: input.workDate,
    clock_in_lat: input.lat,
    clock_in_lng: input.lng,
    selfie_url: input.selfieUrl,
    clock_in_address: input.address,
  });
  if (error) throw error;
}

export interface ClockOutInput {
  sessionId: string;
  userId: string;
  businessEntityId: string;
  projectId: string;
  workLocation: WorkLocation;
  workDate: string;
  clockedInAt: string;
  overtimeRequested: boolean;
  overtimeReason: string | null;
}

export async function clockOut(input: ClockOutInput): Promise<void> {
  const clockOutAt = new Date().toISOString();
  const msWorked = new Date(clockOutAt).getTime() - new Date(input.clockedInAt).getTime();
  const hoursRaw = msWorked / 3_600_000;
  // True elapsed time, rounded to the nearest minute (min ~1 min so it's never 0).
  const hours = Math.max(0.02, Math.min(24, Math.round(hoursRaw * 60) / 60));

  const { error: sessionErr } = await supabase
    .from('clock_sessions')
    .update({ clocked_out_at: clockOutAt, overtime_requested: input.overtimeRequested, overtime_reason: input.overtimeReason })
    .eq('id', input.sessionId);
  if (sessionErr) throw sessionErr;

  const { data: ts, error: tsErr } = await supabase
    .from('timesheets')
    .insert({
      profile_id: input.userId,
      work_date: input.workDate,
      business_entity_id: input.businessEntityId,
      project_id: input.projectId,
      work_location: input.workLocation,
      hours,
      overtime_requested: input.overtimeRequested,
      overtime_reason: input.overtimeReason,
      overtime_status: input.overtimeRequested ? 'pending' : 'none',
      status: 'submitted',
    })
    .select('id')
    .single();
  if (tsErr) throw tsErr;

  if (input.overtimeRequested && ts) {
    await supabase.from('overtime_requests').insert({
      timesheet_id: ts.id,
      profile_id: input.userId,
      reason: input.overtimeReason ?? '',
      status: 'pending',
    });
  }
}

