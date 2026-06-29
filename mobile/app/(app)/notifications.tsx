import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { fetchNotifications, markAllNotificationsRead, type AppNotification } from '@/lib/queries';

const BRONZE = '#1C1A16';

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d}d ago`;
}

export default function Notifications() {
  const profile = useAuth((s) => s.profile);
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setRows(await fetchNotifications(profile.id, 50));
      await markAllNotificationsRead(profile.id); // opening the inbox marks them read
    } catch (e) {
      console.warn('[notifications] load', e);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="p-5 pb-20 gap-2"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRONZE} />}
    >
      {rows.length === 0 ? (
        <Card><Text className="text-muted text-center py-6">No notifications yet.</Text></Card>
      ) : (
        rows.map((n) => (
          <Card key={n.id}>
            <View className="flex-row items-start gap-3">
              <View
                className="mt-1"
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.read ? '#D9D3C8' : BRONZE }}
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold text-ink">{n.title}</Text>
                  <Text className="text-xs" style={{ color: '#A1A1AA' }}>{relative(n.created_at)}</Text>
                </View>
                {n.body ? <Text className="text-muted text-sm mt-0.5">{n.body}</Text> : null}
              </View>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
