import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Label } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { submitLeave, fetchMyLeave, type LeaveType, type LeaveRequest } from '@/lib/queries';
import { todayISO } from '@/lib/date';

const INK = '#1C1A16';
const MUTED = '#71717A';
const LINE = '#E4E4E7';

const TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'unpaid', label: 'Unpaid' },
];

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual Leave', sick: 'Sick Leave', personal: 'Personal Leave', unpaid: 'Unpaid Leave',
};

function fmt(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusColor(s: string) {
  if (s === 'approved') return { bg: 'rgba(22,163,74,0.12)', fg: '#15803D' };
  if (s === 'rejected') return { bg: 'rgba(220,38,38,0.12)', fg: '#DC2626' };
  return { bg: 'rgba(217,119,6,0.12)', fg: '#B45309' };
}

export default function Leave() {
  const profile = useAuth((s) => s.profile);

  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [showPicker, setShowPicker] = useState<null | 'start' | 'end'>(null);
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setHistory(await fetchMyLeave(profile.id));
    } catch (e) {
      console.warn('[leave] load', e);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const onPick = (which: 'start' | 'end', d?: Date) => {
    setShowPicker(null);
    if (!d) return;
    const iso = d.toLocaleDateString('en-CA');
    if (which === 'start') {
      setStartDate(iso);
      if (iso > endDate) setEndDate(iso); // keep end >= start
    } else {
      setEndDate(iso);
    }
  };

  const submit = async () => {
    if (!profile || submitting) return;
    if (endDate < startDate) {
      Alert.alert('Invalid dates', 'End date must be on or after the start date.');
      return;
    }
    setSubmitting(true);
    try {
      await submitLeave({
        userId: profile.id,
        leaveType,
        startDate,
        endDate,
        reason: reason.trim() || null,
      });
      setReason('');
      Alert.alert('Leave submitted', 'Your leave request was sent to your admin for approval.');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit leave.');
    } finally {
      setSubmitting(false);
    }
  };

  const dateRow = (label: string, value: string, which: 'start' | 'end') => (
    <View className="flex-1">
      <Label>{label}</Label>
      <Pressable
        onPress={() => setShowPicker(which)}
        className="flex-row items-center justify-between bg-white rounded-2xl px-4 py-3.5 mt-1.5"
        style={{ borderWidth: 1, borderColor: LINE }}
      >
        <Text className="text-ink text-base">{fmt(value)}</Text>
        <Ionicons name="calendar-outline" size={18} color={MUTED} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <ScrollView className="flex-1" contentContainerClassName="p-5 pb-24">
        {/* Submit form */}
        <Card>
          <Text className="text-lg font-bold text-ink mb-1">Request Leave</Text>
          <Text className="text-muted text-sm mb-4">Submit a leave request for your admin to approve.</Text>

          <Label>Leave type</Label>
          <View className="flex-row flex-wrap mt-1.5 mb-3">
            {TYPES.map((t) => (
              <Chip key={t.value} label={t.label} selected={leaveType === t.value} onPress={() => setLeaveType(t.value)} />
            ))}
          </View>

          <View className="flex-row gap-3 mb-3">
            {dateRow('From', startDate, 'start')}
            {dateRow('To', endDate, 'end')}
          </View>

          <Label>Reason (optional)</Label>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Add a note for your admin…"
            placeholderTextColor={MUTED}
            multiline
            className="bg-white rounded-2xl px-4 py-3 mt-1.5 mb-4 text-ink text-base"
            style={{ borderWidth: 1, borderColor: LINE, minHeight: 72, textAlignVertical: 'top' }}
          />

          <Button
            label={submitting ? 'Submitting…' : 'Submit Leave Request'}
            loading={submitting}
            disabled={submitting}
            onPress={submit}
          />
        </Card>

        {/* History */}
        <Text className="text-lg font-bold text-ink mt-6 mb-2">My Leave</Text>
        {loading ? (
          <View className="py-8 items-center"><ActivityIndicator color={INK} /></View>
        ) : history.length === 0 ? (
          <Card><Text className="text-muted">No leave requests yet.</Text></Card>
        ) : (
          <View className="gap-2">
            {history.map((r) => {
              const c = statusColor(r.status);
              return (
                <Card key={r.id}>
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="font-semibold text-ink">{TYPE_LABELS[r.leave_type] ?? r.leave_type}</Text>
                    <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: c.bg }}>
                      <Text className="text-xs font-bold capitalize" style={{ color: c.fg }}>{r.status}</Text>
                    </View>
                  </View>
                  <Text className="text-muted text-sm">
                    {r.start_date === r.end_date ? fmt(r.start_date) : `${fmt(r.start_date)} – ${fmt(r.end_date)}`}
                  </Text>
                  {r.reason ? <Text className="text-ink text-sm mt-1.5">{r.reason}</Text> : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Native date picker */}
      {showPicker && (
        <DateTimePicker
          value={new Date((showPicker === 'start' ? startDate : endDate) + 'T00:00:00')}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={showPicker === 'end' ? new Date(startDate + 'T00:00:00') : undefined}
          onChange={(_, d) => onPick(showPicker, d)}
        />
      )}
    </SafeAreaView>
  );
}
