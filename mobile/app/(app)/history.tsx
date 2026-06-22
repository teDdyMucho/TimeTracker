import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { fetchRecentTimesheets } from '@/lib/queries';
import { friendlyDate } from '@/lib/date';
import type { Timesheet } from '@/lib/types';

export default function History() {
  const profile = useAuth((s) => s.profile);
  const [rows, setRows] = useState<Timesheet[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setRows(await fetchRecentTimesheets(profile.id, 100));
    } catch (e) {
      console.warn('[history] load', e);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by work_date
  const byDate = rows.reduce<Record<string, Timesheet[]>>((acc, t) => {
    (acc[t.work_date] ||= []).push(t);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-5 pb-20">
      {dates.length === 0 ? (
        <Card><Text className="text-muted">No timesheets yet.</Text></Card>
      ) : (
        dates.map((d) => {
          const dayRows = byDate[d];
          const total = dayRows.reduce((s, t) => s + Number(t.hours), 0);
          return (
            <View key={d} className="mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="font-bold text-ink">{friendlyDate(d)}</Text>
                <Text className="text-muted font-semibold">{Math.round(total * 100) / 100} h</Text>
              </View>
              <View className="gap-2">
                {dayRows.map((t) => (
                  <Card key={t.id}>
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-3">
                        <Text className="text-ink font-medium capitalize">{t.work_location}</Text>
                        <Text className="text-muted text-sm">
                          {t.overtime_requested ? `Overtime · ${t.overtime_status}` : t.status}
                        </Text>
                      </View>
                      <Text className="text-lg font-bold text-ink">{Number(t.hours)} h</Text>
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
