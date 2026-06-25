import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';
import {
  clockOut,
  fetchActiveSession,
  fetchHomeSummary,
  fetchRecentTimesheets,
  fetchUnreadCount,
  type HomeSummary,
} from '@/lib/queries';
import { friendlyDate } from '@/lib/date';
import { formatHours } from '@/lib/format';
import { cancelClockOutReminder } from '@/lib/notify';
import type { ClockSession, Timesheet } from '@/lib/types';

// Build One palette constants
const BRONZE   = '#9A7A4E';
const BRONZE_DK = '#836439';
const INK      = '#1F1D1A';
const MUTED    = '#76716A';
const LINE     = '#E7E2D8';
const PAPER    = '#F6F4EF';

function elapsedLabel(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Home() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);

  const [summary, setSummary] = useState<HomeSummary>({ todayHours: 0, weekHours: 0, pendingOvertime: 0 });
  const [recent, setRecent] = useState<Timesheet[]>([]);
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const [clockingOut, setClockingOut] = useState(false);
  const [overtime, setOvertime] = useState(false);
  const [otReason, setOtReason] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [s, r, session, unreadCount] = await Promise.all([
        fetchHomeSummary(profile.id),
        fetchRecentTimesheets(profile.id, 10),
        fetchActiveSession(profile.id),
        fetchUnreadCount(profile.id),
      ]);
      setSummary(s);
      setRecent(r);
      setActiveSession(session);
      setUnread(unreadCount);
      if (session) setElapsed(elapsedLabel(session.clocked_in_at));
    } catch (e) {
      console.warn('[home] load', e);
    }
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (activeSession) {
      timerRef.current = setInterval(() => {
        setElapsed(elapsedLabel(activeSession.clocked_in_at));
      }, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeSession]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleClockOut = useCallback(async () => {
    if (!profile || !activeSession) return;
    setClockingOut(true);
    try {
      await clockOut({
        sessionId: activeSession.id,
        userId: profile.id,
        businessEntityId: activeSession.business_entity_id,
        projectId: activeSession.project_id,
        workLocation: activeSession.work_location,
        workDate: activeSession.work_date,
        clockedInAt: activeSession.clocked_in_at,
        overtimeRequested: overtime,
        overtimeReason: overtime ? otReason.trim() : null,
      });
      await cancelClockOutReminder();
      setActiveSession(null);
      setOvertime(false);
      setOtReason('');
      await load();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not clock out.');
    } finally {
      setClockingOut(false);
    }
  }, [profile, activeSession, overtime, otReason, load]);

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
            {/* Notifications */}
            <Pressable onPress={() => router.push('/notifications')} className="relative">
              <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(154,122,78,0.10)' }}>
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

        {/* ── CLOCKED IN STATE ─────────────────────────────────────── */}
        {activeSession ? (
          <Card className="mb-4" style={{ backgroundColor: 'rgba(154,122,78,0.06)', borderColor: LINE }}>
            <View className="flex-row items-center gap-3 mb-3">
              <View className="w-3 h-3 rounded-full" style={{ backgroundColor: BRONZE }} />
              <Text className="font-bold text-ink text-base">On the clock</Text>
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
                      {friendlyDate(t.work_date)}
                    </Text>
                    <Text className="text-muted text-sm capitalize">
                      {t.work_location === 'site' ? 'On Site' : 'Factory'} &middot;{' '}
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
