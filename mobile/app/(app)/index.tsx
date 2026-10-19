import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';
import {
  clockOut,
  autoClockOut,
  isSessionExpired,
  AUTO_CLOCK_OUT_HOURS,
  fetchActiveSession,
  fetchHomeSummary,
  fetchRecentTimesheets,
  fetchUnreadCount,
  fetchUnreadMessageCount,
  type HomeSummary,
} from '@/lib/queries';
import { friendlyDate } from '@/lib/date';
import { formatHours } from '@/lib/format';
import { cancelClockOutReminder, syncClockInReminders } from '@/lib/notify';
import { clockOutMessage, workedLabel } from '@/lib/clock-feedback';
import { cacheActiveSession, clearFailed, flushQueue, readCachedSession, readFailed, readQueue, queueClockOut } from '@/lib/offline';
import { describeQueue, isLocalId, isNetworkError, resolveShownSession, type FailedOp } from '@/lib/offline-core';
import type { ClockSession, Timesheet } from '@/lib/types';

// Build One palette constants
const BRONZE   = '#1C1A16';
const BRONZE_DK = '#000000';
const INK      = '#18181B';
const MUTED    = '#71717A';
const LINE     = '#E4E4E7';
const PAPER    = '#F4F4F5';

function elapsedLabel(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Home() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  // Safety net: if we have a session but the profile didn't load (e.g. the
  // refetch failed overnight → "Welcome back, there"), pull it again on mount
  // instead of showing the empty/"T" state.
  useEffect(() => {
    if (session && !profile) refreshProfile();
  }, [session, profile, refreshProfile]);

  // Hours, sessions and clock-out are keyed by the signed-in user, NOT the
  // profile row — so a profile that failed to load can't blank out the worker's
  // hours or silently disable Clock Out.
  const userId = session?.user.id ?? profile?.id ?? null;

  const [summary, setSummary] = useState<HomeSummary>({ todayHours: 0, weekHours: 0, pendingOvertime: 0 });
  const [recent, setRecent] = useState<Timesheet[]>([]);
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  const [clockingOut, setClockingOut] = useState(false);
  const [overtime, setOvertime] = useState(false);
  const [otReason, setOtReason] = useState('');

  // Offline queue (clock-ins / clock-outs saved on the phone, not yet sent).
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);
  const [queuedText, setQueuedText] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState<FailedOp[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOutRef = useRef(false); // guards against double auto-clock-out
  const loadingRef = useRef(false);
  const rerunRef = useRef(false);

  const load = useCallback(async () => {
    if (!userId) return;
    // Focus, foreground, the timers and pull-to-refresh can all fire at once:
    // run one load at a time and fold the extra calls into a single follow-up.
    if (loadingRef.current) { rerunRef.current = true; return; }
    loadingRef.current = true;
    try {
      // 1. Send anything saved while offline, in order, before reading the server.
      let queue = await readQueue(userId);
      if (queue.length > 0) {
        setSyncing(true);
        try { await flushQueue(userId); } catch (e) { console.warn('[home] flush', e); }
        setSyncing(false);
        queue = await readQueue(userId);
      }
      setQueued(queue.length);
      setQueuedText(describeQueue(queue));
      setFailed(await readFailed(userId));

      try {
        const [s, r, session, unreadCount, unreadMsgCount] = await Promise.all([
          fetchHomeSummary(userId),
          fetchRecentTimesheets(userId, 10),
          fetchActiveSession(userId),
          fetchUnreadCount(userId),
          fetchUnreadMessageCount(userId),
        ]);
        // A clock-in still waiting in the queue is "on the clock" until it
        // syncs; a server session whose clock-out is queued is not.
        const shown = resolveShownSession(queue, session);
        // Remember the open server session (if that is what is shown) so a
        // restart with no signal still shows "on the clock" instead of
        // offering a second clock-in. Queued (local) sessions are not cached:
        // they are rebuilt from the queue.
        await cacheActiveSession(userId, shown);

        // Forgot to clock out? If the server session has run past the auto
        // clock-out limit (and no clock-out for it is waiting in the queue),
        // close it automatically, capped at exactly that many hours, and reload.
        if (session && shown?.id === session.id && isSessionExpired(session) && !autoOutRef.current) {
          autoOutRef.current = true;
          try {
            await autoClockOut(session);
            await cancelClockOutReminder();
            await cacheActiveSession(userId, null);
            Alert.alert(
              'Automatically clocked out',
              `You reached ${AUTO_CLOCK_OUT_HOURS} hours on the clock, so we clocked you out and logged a ${AUTO_CLOCK_OUT_HOURS}-hour shift. If you kept working past that, let your supervisor know.`,
            );
          } finally {
            autoOutRef.current = false;
          }
          rerunRef.current = true;
        } else {
          setOffline(false);
          setSummary(s);
          setRecent(r);
          setActiveSession(shown);
          setUnread(unreadCount);
          setUnreadMsgs(unreadMsgCount);
          if (shown) setElapsed(elapsedLabel(shown.clocked_in_at));
        }
      } catch (e) {
        if (isNetworkError(e)) {
          // No connection: keep the hours on screen, show the queued or last
          // known session so the worker can still clock out, and flag the banner.
          setOffline(true);
          const shown = resolveShownSession(queue, await readCachedSession(userId));
          setActiveSession(shown);
          if (shown) setElapsed(elapsedLabel(shown.clocked_in_at));
        } else {
          console.warn('[home] load', e);
        }
      }
    } finally {
      loadingRef.current = false;
    }
    if (rerunRef.current) {
      rerunRef.current = false;
      await load();
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Back from the background (e.g. signal returned while the phone was in a
  // pocket): sync the queue and refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  // While something is waiting to sync, retry every 30 seconds.
  useEffect(() => {
    if (queued === 0) return;
    const id = setInterval(() => { load(); }, 30_000);
    return () => clearInterval(id);
  }, [queued, load]);

  // Keep the 6:50 / 7:10 morning clock-in reminders armed for the next two
  // weeks. Cheap and idempotent, so it runs on every open. Skipped when the
  // worker has turned notifications off, or while the profile hasn't loaded yet
  // (we don't know their preference).
  useEffect(() => {
    if (profile && profile.notifications_enabled !== false) void syncClockInReminders();
  }, [profile]);

  useEffect(() => {
    if (activeSession) {
      timerRef.current = setInterval(() => {
        // If it crosses the limit while the app is open, auto clock out
        // (server sessions only — a queued clock-in is closed when it syncs).
        if (!isLocalId(activeSession.id) && isSessionExpired(activeSession)) {
          load();
          return;
        }
        setElapsed(elapsedLabel(activeSession.clocked_in_at));
      }, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeSession, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Pull-to-refresh also recovers a profile that failed to load.
    if (!profile) await refreshProfile();
    await load();
    setRefreshing(false);
  }, [load, profile, refreshProfile]);

  const handleClockOut = useCallback(async () => {
    if (!userId || !activeSession) return;
    setClockingOut(true);
    const reason = overtime ? otReason.trim() : null;

    // Save the clock-out on the phone; it is sent when the connection is back.
    const saveOffline = async () => {
      await queueClockOut({
        userId,
        sessionId: activeSession.id,
        overtimeRequested: overtime,
        overtimeReason: reason,
      });
      await cancelClockOutReminder();
      const worked = workedLabel(activeSession.clocked_in_at);
      setActiveSession(null);
      setOvertime(false);
      setOtReason('');
      const q = await readQueue();
      setQueued(q.length);
      setQueuedText(describeQueue(q));
      Alert.alert(
        'Saved on your phone',
        `${worked} recorded. There's no connection right now, so your clock-out is saved on this phone and will be sent to the office automatically when you're back online.`,
      );
    };

    try {
      // A clock-in that is itself still queued cannot be closed on the server yet.
      if (isLocalId(activeSession.id) || offline) {
        await saveOffline();
        return;
      }
      await clockOut({
        sessionId: activeSession.id,
        userId,
        businessEntityId: activeSession.business_entity_id,
        projectId: activeSession.project_id,
        workLocation: activeSession.work_location,
        workDate: activeSession.work_date,
        clockedInAt: activeSession.clocked_in_at,
        overtimeRequested: overtime,
        overtimeReason: reason,
      });
      await cancelClockOutReminder();
      await cacheActiveSession(userId, null);
      const msg = clockOutMessage(workedLabel(activeSession.clocked_in_at), overtime);
      setActiveSession(null);
      setOvertime(false);
      setOtReason('');
      await load();
      // PRD §7 confirmation: "Timesheet Successfully Submitted".
      Alert.alert(msg.title, msg.body);
    } catch (err) {
      if (isNetworkError(err)) {
        setOffline(true);
        await saveOffline();
      } else {
        Alert.alert('Error', err instanceof Error ? err.message : 'Could not clock out.');
      }
    } finally {
      setClockingOut(false);
    }
  }, [userId, activeSession, overtime, otReason, offline, load]);

  const syncNow = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      const r = await flushQueue(userId);
      if (r.remaining > 0 && r.error === 'offline') {
        Alert.alert('Still offline', 'No connection yet. Your hours are safe on this phone and will be sent automatically.');
      }
    } finally {
      setSyncing(false);
      await load();
    }
  }, [load, userId]);

  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 pb-32"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRONZE} />}
      >
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-muted">Welcome back,</Text>
            <Text className="text-2xl font-bold text-ink">{firstName}</Text>
          </View>
          <View className="flex-row items-center gap-3">
            {/* Messages */}
            <Pressable onPress={() => router.push('/messages')} className="relative">
              <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(28,26,22,0.10)' }}>
                <Ionicons name="chatbubble-ellipses-outline" size={21} color={INK} />
              </View>
              {unreadMsgs > 0 && (
                <View
                  className="absolute -top-0.5 -right-0.5 items-center justify-center"
                  style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', paddingHorizontal: 4 }}
                >
                  <Text className="text-white font-bold" style={{ fontSize: 10 }}>{unreadMsgs}</Text>
                </View>
              )}
            </Pressable>

            {/* Notifications */}
            <Pressable onPress={() => router.push('/notifications')} className="relative">
              <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(28,26,22,0.10)' }}>
                <Ionicons name="notifications-outline" size={21} color={INK} />
              </View>
              {unread > 0 && (
                <View
                  className="absolute -top-0.5 -right-0.5 items-center justify-center"
                  style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', paddingHorizontal: 4 }}
                >
                  <Text className="text-white font-bold" style={{ fontSize: 10 }}>{unread}</Text>
                </View>
              )}
            </Pressable>

            {/* Profile */}
            <Pressable onPress={() => router.push('/settings')}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: LINE }} />
              ) : (
                <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: BRONZE }}>
                  <Text className="text-white font-bold text-base">{firstName[0]?.toUpperCase() ?? 'U'}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mb-4">
          <Card className="flex-1">
            <Text className="text-muted text-xs uppercase tracking-wide">Today</Text>
            <Text className="text-3xl font-bold text-ink mt-1">{formatHours(summary.todayHours)}</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-muted text-xs uppercase tracking-wide">This week</Text>
            <Text className="text-3xl font-bold text-ink mt-1">{formatHours(summary.weekHours)}</Text>
          </Card>
        </View>

        {/* Overtime pending badge */}
        {summary.pendingOvertime > 0 ? (
          <Card className="mb-4" style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
            <Text style={{ color: '#92400E', fontWeight: '500' }}>
              {summary.pendingOvertime} overtime request{summary.pendingOvertime > 1 ? 's' : ''} awaiting approval
            </Text>
          </Card>
        ) : null}

        {/* Offline queue banner — hours saved on the phone, not yet at the office */}
        {queued > 0 ? (
          <Card className="mb-4" style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
            <View className="flex-row items-center gap-3">
              <Ionicons name={offline ? 'cloud-offline-outline' : 'cloud-upload-outline'} size={22} color="#92400E" />
              <View className="flex-1">
                <Text style={{ color: '#92400E', fontWeight: '600' }}>
                  {queuedText || `${queued} item${queued > 1 ? 's' : ''}`} saved on this phone
                </Text>
                <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                  {offline
                    ? `No connection. ${queued > 1 ? 'They' : 'It'} will be sent automatically when you are back online.`
                    : syncing ? 'Sending to the office…' : 'Waiting to send to the office.'}
                </Text>
              </View>
              <Pressable
                onPress={syncNow}
                disabled={syncing}
                className="px-3 py-2 rounded-xl"
                style={{ backgroundColor: '#92400E', opacity: syncing ? 0.6 : 1 }}
              >
                <Text className="text-white font-semibold text-xs">{syncing ? 'Syncing…' : 'Sync now'}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* Items the phone gave up on — the office must add these by hand */}
        {failed.length > 0 ? (
          <Card className="mb-4" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
            <View className="flex-row items-center gap-3">
              <Ionicons name="alert-circle-outline" size={22} color="#B91C1C" />
              <View className="flex-1">
                <Text style={{ color: '#B91C1C', fontWeight: '600' }}>
                  {failed.length === 1 ? '1 item could not be sent' : `${failed.length} items could not be sent`}
                </Text>
                <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 2 }}>
                  {failed
                    .map((f) => `${f.kind === 'clock_in' ? 'Clock-in' : 'Clock-out'} at ${new Date(f.at).toLocaleString()}`)
                    .join(', ')}
                  . Please tell the office so they can add the hours.
                </Text>
              </View>
              <Pressable
                onPress={async () => { if (userId) { await clearFailed(userId); setFailed([]); } }}
                className="px-3 py-2 rounded-xl"
                style={{ backgroundColor: '#B91C1C' }}
              >
                <Text className="text-white font-semibold text-xs">Dismiss</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* ── CLOCKED IN STATE ─────────────────────────────────────── */}
        {activeSession ? (
          <Card className="mb-4" style={{ backgroundColor: 'rgba(28,26,22,0.06)', borderColor: LINE }}>
            <View className="flex-row items-center gap-3 mb-3">
              <View className="w-3 h-3 rounded-full" style={{ backgroundColor: BRONZE }} />
              <Text className="font-bold text-ink text-base">
                {isLocalId(activeSession.id) ? 'On the clock (saved on phone)' : 'On the clock'}
              </Text>
              <Text className="ml-auto font-semibold text-lg" style={{ color: BRONZE }}>{elapsed}</Text>
            </View>
            <Text className="text-muted text-sm mb-4">
              {activeSession.work_location === 'site' ? 'On Site' : 'Factory / Workshop'}
            </Text>

            {/* Overtime toggle */}
            <View className="bg-white rounded-xl px-4 py-3 mb-3" style={{ borderWidth: 1, borderColor: LINE }}>
              <View className="flex-row justify-between items-center">
                <Text className="font-medium text-ink">Overtime worked?</Text>
                <Switch
                  value={overtime}
                  onValueChange={(v) => setOvertime(v)}
                  trackColor={{ true: BRONZE, false: '#D9D3C8' }}
                  thumbColor="#ffffff"
                />
              </View>
              {overtime ? (
                <TextInput
                  value={otReason}
                  onChangeText={setOtReason}
                  placeholder="Reason for overtime (required)"
                  placeholderTextColor={MUTED}
                  multiline
                  className="rounded-xl px-3 py-2 mt-3 text-ink"
                  style={{ borderWidth: 1, borderColor: LINE }}
                />
              ) : null}
            </View>

            <Button
              label={clockingOut ? 'Clocking out…' : 'Clock Out'}
              loading={clockingOut}
              disabled={clockingOut || (overtime && otReason.trim().length === 0)}
              onPress={handleClockOut}
            />

            {/* Switch to a different project without clocking out for the day.
                Needs the session on the server, so it is hidden while offline. */}
            {!isLocalId(activeSession.id) && !offline ? (
              <Pressable
                onPress={() => router.push('/switch-project')}
                className="flex-row items-center justify-center gap-2 mt-3 py-3 rounded-2xl bg-white"
                style={{ borderWidth: 1, borderColor: LINE }}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color={INK} />
                <Text className="font-semibold text-ink">Switch Project</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : (
          /* ── NOT CLOCKED IN ─────────────────────────────────────── */
          <View className="mb-4">
            <Button
              label="Clock In"
              onPress={() => router.push('/clock-in')}
            />
          </View>
        )}

        {/* Quick action — Request Leave */}
        <Pressable
          onPress={() => router.push('/leave')}
          className="flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3.5 mb-4"
          style={{ borderWidth: 1, borderColor: LINE }}
        >
          <View className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(28,26,22,0.08)' }}>
            <Ionicons name="calendar-outline" size={20} color={INK} />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-ink">Request Leave</Text>
            <Text className="text-muted text-xs">Annual, sick, personal or unpaid</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={MUTED} />
        </Pressable>

        {/* Recent timesheets */}
        <View className="flex-row justify-between items-center mt-2 mb-2">
          <Text className="text-lg font-bold text-ink">Recent</Text>
          <Pressable onPress={() => router.push('/history')}>
            <Text className="font-semibold" style={{ color: BRONZE }}>View all</Text>
          </Pressable>
        </View>

        {recent.length === 0 ? (
          <Card>
            <Text className="text-muted">No timesheets yet. Clock in to start.</Text>
          </Card>
        ) : (
          <View className="gap-2">
            {recent.map((t) => (
              <Card key={t.id}>
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 pr-3">
                    <Text className="font-semibold text-ink" numberOfLines={1}>
                      {t.projects?.name ?? 'No project'}
                    </Text>
                    <Text className="text-muted text-sm">
                      {friendlyDate(t.work_date)} &middot;{' '}
                      {t.work_location === 'site' ? 'On Site' : 'Factory'}
                    </Text>
                    <Text className="text-muted text-xs capitalize mt-0.5">
                      {t.overtime_status !== 'none' ? `OT ${t.overtime_status}` : t.status}
                    </Text>
                  </View>
                  <Text className="text-lg font-bold text-ink">{formatHours(Number(t.hours))}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
