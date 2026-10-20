import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { decideOvertime, fetchMyApprovals } from '@/lib/queries';
import { friendlyDate } from '@/lib/date';
import { formatHours } from '@/lib/format';
import type { OvertimeApproval } from '@/lib/types';

const INK = '#18181B';
const LINE = '#E4E4E7';

/**
 * TV3: requests addressed to the signed-in approver, with Approve / Reject.
 * The same buttons are on the push notification itself; this screen is for
 * when the push was dismissed or the approver wants the detail.
 */
export default function Approvals() {
  const profile = useAuth((s) => s.profile);
  const [rows, setRows] = useState<OvertimeApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchMyApprovals());
    } catch (e) {
      console.warn('[approvals] load', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const decide = (r: OvertimeApproval, decision: 'approved' | 'rejected') => {
    Alert.alert(
      decision === 'approved' ? 'Approve overtime?' : 'Reject overtime?',
      `${r.worker_name}${r.work_date ? ` · ${friendlyDate(r.work_date)}` : ''}\n“${r.reason}”`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approved' ? 'Approve' : 'Reject',
          style: decision === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            setActing(r.id);
            try {
              await decideOvertime(r.id, decision);
              setRows((prev) => prev.filter((x) => x.id !== r.id));
            } catch (e) {
              Alert.alert('Could not record your decision', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  };

  if (!profile?.overtime_approver) {
    return (
      <View className="flex-1 bg-paper p-5">
        <Card><Text className="text-muted">Only overtime approvers can see this screen.</Text></Card>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="p-5 pb-20"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {loading ? (
        <ActivityIndicator color={INK} />
      ) : rows.length === 0 ? (
        <Card><Text className="text-muted">No overtime requests waiting for you.</Text></Card>
      ) : (
        <View className="gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <Text className="font-bold text-ink text-base">{r.worker_name}</Text>
              <Text className="text-muted text-xs mt-0.5">
                {r.work_date ? friendlyDate(r.work_date) : 'Today'}
                {r.project_name ? ` · ${r.project_name}` : ''}
                {r.hours != null ? ` · ${formatHours(Number(r.hours))}` : r.still_on_clock ? ' · still on the clock' : ''}
              </Text>
              <View className="rounded-xl px-3 py-2 mt-3" style={{ backgroundColor: '#F4F4F5' }}>
                <Text className="text-ink text-sm">“{r.reason}”</Text>
              </View>
              <View className="flex-row gap-3 mt-3">
                <Pressable
                  onPress={() => decide(r, 'approved')}
                  disabled={acting === r.id}
                  className="flex-1 items-center py-3 rounded-2xl"
                  style={{ backgroundColor: '#1C1A16', opacity: acting === r.id ? 0.6 : 1 }}
                >
                  <Text className="text-white font-semibold">Approve</Text>
                </Pressable>
                <Pressable
                  onPress={() => decide(r, 'rejected')}
                  disabled={acting === r.id}
                  className="flex-1 items-center py-3 rounded-2xl bg-white"
                  style={{ borderWidth: 1, borderColor: LINE, opacity: acting === r.id ? 0.6 : 1 }}
                >
                  <Text className="font-semibold" style={{ color: '#B91C1C' }}>Reject</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
