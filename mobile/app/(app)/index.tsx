import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import {
  clockOut,
  fetchActiveSession,
  fetchHomeSummary,
  fetchRecentTimesheets,
  type HomeSummary,
} from '@/lib/queries';
import { friendlyDate } from '@/lib/date';
import type { ClockSession, Timesheet } from '@/lib/types';

function elapsedLabel(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Home() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);

  const [summary, setSummary] = useState<HomeSummary>({ todayHours: 0, weekHours: 0, pendingOvertime: 0 });
  const [recent, setRecent] = useState<Timesheet[]>([]);
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Clock out state
  const [clockingOut, setClockingOut] = useState(false);
  const [showOtPanel, setShowOtPanel] = useState(false);
  const [overtime, setOvertime] = useState(false);
  const [otReason, setOtReason] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [s, r, session] = await Promise.all([
        fetchHomeSummary(profile.id),
        fetchRecentTimesheets(profile.id, 10),
        fetchActiveSession(profile.id),
      ]);
      setSummary(s);
      setRecent(r);
      setActiveSession(session);
      if (session) setElapsed(elapsedLabel(session.clocked_in_at));
    } catch (e) {
      console.warn('[home] load', e);
    }
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live elapsed timer
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
      setActiveSession(null);
      setShowOtPanel(false);
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
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 pb-32"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ABFA3" />}
      >
        {/* Header */}
        <View className="flex-row justify-between items-start mb-6">
          <View>
            <Text className="text-muted">Kia ora,</Text>
            <Text className="text-2xl font-bold text-ink">{firstName}</Text>
          </View>
          <Pressable onPress={signOut} className="px-3 py-2">
            <Text className="text-muted font-medium">Sign out</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mb-4">
          <Card className="flex-1">
            <Text className="text-muted text-xs uppercase tracking-wide">Today</Text>
            <Text className="text-3xl font-bold text-ink mt-1">
              {summary.todayHours}<Text className="text-base text-muted"> h</Text>
            </Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-muted text-xs uppercase tracking-wide">This week</Text>
            <Text className="text-3xl font-bold text-ink mt-1">
              {summary.weekHours}<Text className="text-base text-muted"> h</Text>
            </Text>
          </Card>
        </View>

        {/* Overtime pending badge */}
        {summary.pendingOvertime > 0 ? (
          <Card className="mb-4 bg-amber-50 border border-amber-200">
            <Text className="text-amber-800 font-medium">
              {summary.pendingOvertime} overtime request{summary.pendingOvertime > 1 ? 's' : ''} awaiting approval
            </Text>
          </Card>
        ) : null}

        {/* ── CLOCKED IN STATE ─────────────────────────────────────── */}
        {activeSession ? (
          <Card className="mb-4 bg-teal-50 border border-teal-200">
            <View className="flex-row items-center gap-3 mb-3">
              <View className="w-3 h-3 rounded-full bg-teal-500" />
              <Text className="font-bold text-teal-800 text-base">On the clock</Text>
              <Text className="ml-auto text-teal-600 font-semibold text-lg">{elapsed}</Text>
            </View>
            <Text className="text-teal-700 text-sm mb-4">
              {activeSession.work_location === 'site' ? '🏗  On Site' : '🏭  Factory / Workshop'}
            </Text>

            {/* Overtime toggle */}
            <View className="bg-white rounded-xl px-4 py-3 mb-3">
              <View className="flex-row justify-between items-center">
                <Text className="font-medium text-ink">Overtime worked?</Text>
                <Switch
                  value={overtime}
                  onValueChange={(v) => { setOvertime(v); setShowOtPanel(v); }}
                  trackColor={{ true: '#0ABFA3', false: '#d1d5db' }}
                />
              </View>
              {overtime ? (
                <TextInput
                  value={otReason}
                  onChangeText={setOtReason}
                  placeholder="Reason for overtime (required)"
                  multiline
                  className="border border-gray-200 rounded-xl px-3 py-2 mt-3 text-ink"
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
              label="🕐  Clock In"
              onPress={() => router.push('/clock-in')}
            />
          </View>
        )}

        {/* Recent timesheets */}
        <View className="flex-row justify-between items-center mt-2 mb-2">
          <Text className="text-lg font-bold text-ink">Recent</Text>
          <Pressable onPress={() => router.push('/history')}>
            <Text className="text-brand font-semibold">View all</Text>
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
                      {t.work_location === 'site' ? 'On Site' : 'Factory'} ·{' '}
                      {t.overtime_status !== 'none' ? `OT ${t.overtime_status}` : t.status}
                    </Text>
                  </View>
                  <Text className="text-lg font-bold text-ink">{Number(t.hours)} h</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
