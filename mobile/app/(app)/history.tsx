import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { fetchRecentTimesheets, fetchClockSessions } from '@/lib/queries';
import { friendlyDate } from '@/lib/date';
import { formatHours, formatTime } from '@/lib/format';
import type { ClockSession, Timesheet } from '@/lib/types';

const BRONZE = '#9A7A4E';
const LINE = '#E7E2D8';

export default function History() {
  const profile = useAuth((s) => s.profile);
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [sessions, setSessions] = useState<ClockSession[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [ts, ses] = await Promise.all([
        fetchRecentTimesheets(profile.id, 100),
        fetchClockSessions(profile.id, 100),
      ]);
      setRows(ts);
      setSessions(ses);
    } catch (e) {
      console.warn('[history] load', e);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Group by day, and pair each timesheet with its clock-in session (for photo + times).
  const days = useMemo(() => {
    const tsByDate: Record<string, Timesheet[]> = {};
    rows.forEach((t) => { (tsByDate[t.work_date] ||= []).push(t); });
    const sesByDate: Record<string, ClockSession[]> = {};
    sessions.forEach((s) => { (sesByDate[s.work_date] ||= []).push(s); });

    const allDates = Array.from(new Set([...Object.keys(tsByDate), ...Object.keys(sesByDate)]))
      .sort((a, b) => (a < b ? 1 : -1));

    return allDates.map((date) => {
      const dayTs = tsByDate[date] ?? [];
      const daySes = sesByDate[date] ?? [];
      const used = new Set<string>();
      const items = dayTs.map((t) => {
        const s =
          daySes.find((x) => !used.has(x.id) && x.work_location === t.work_location) ??
          daySes.find((x) => !used.has(x.id));
        if (s) used.add(s.id);
        return { t, s };
      });
      const total = dayTs.reduce((acc, t) => acc + Number(t.hours), 0);
      return { date, items, total };
    });
  }, [rows, sessions]);

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="p-5 pb-20">
      {days.length === 0 ? (
        <Card><Text className="text-muted">No timesheets yet.</Text></Card>
      ) : (
        days.map(({ date, items, total }) => (
          <View key={date} className="mb-5">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="font-bold text-ink">{friendlyDate(date)}</Text>
              <Text className="text-muted font-semibold">{formatHours(total)}</Text>
            </View>

            <View className="gap-2">
              {items.map(({ t, s }) => (
                <Card key={t.id}>
                  <View className="flex-row items-center">
                    {/* Clock-in photo (or placeholder) */}
                    {s?.selfie_url ? (
                      <Pressable onPress={() => setViewer(s.selfie_url!)} className="mr-3">
                        <Image
                          source={{ uri: s.selfie_url! }}
                          style={{ width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: LINE }}
                        />
                      </Pressable>
                    ) : (
                      <View
                        className="mr-3 items-center justify-center"
                        style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: 'rgba(154,122,78,0.10)' }}
                      >
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(154,122,78,0.4)' }} />
                      </View>
                    )}

                    {/* Details */}
                    <View className="flex-1 pr-2">
                      <Text className="text-ink font-semibold">
                        {t.work_location === 'site' ? 'On Site' : 'Factory'}
                      </Text>
                      <Text className="text-muted text-xs capitalize mt-0.5">
                        {t.overtime_requested ? `Overtime · ${t.overtime_status}` : t.status}
                      </Text>
                      {s ? (
                        <Text className="text-xs mt-0.5" style={{ color: BRONZE }}>
                          {formatTime(s.clocked_in_at)}
                          {s.clocked_out_at ? ` – ${formatTime(s.clocked_out_at)}` : ''}
                        </Text>
                      ) : null}
                    </View>

                    {/* Hours */}
                    <Text className="text-lg font-bold text-ink">{formatHours(Number(t.hours))}</Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ))
      )}

      {/* Full-screen photo viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable
          onPress={() => setViewer(null)}
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
        >
          {viewer && (
            <Image source={{ uri: viewer }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />
          )}
          <Text className="text-white/70 mt-6">Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
