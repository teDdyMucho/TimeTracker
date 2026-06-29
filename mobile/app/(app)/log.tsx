import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Label } from '@/components/ui';
import { formatHours } from '@/lib/format';
import { useAuth } from '@/store/auth';
import {
  fetchBusinessEntities,
  fetchProjects,
  fetchRecentTimesheets,
  submitTimesheets,
} from '@/lib/queries';
import { addDays, friendlyDate, todayISO } from '@/lib/date';
import type { BusinessEntity, Project, TimesheetLine, WorkLocation } from '@/lib/types';

const HOUR_CHIPS = [4, 6, 8, 8.5, 10];
const MIN_HOURS = 0.5;
const MAX_HOURS = 24;
const clampHours = (n: number) => Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(n * 2) / 2));

const emptyLine = (): TimesheetLine => ({
  projectId: null,
  projectName: null,
  workLocation: 'site',
  hours: 8,
});

export default function LogHours() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);

  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workDate, setWorkDate] = useState(todayISO());
  const [lines, setLines] = useState<TimesheetLine[]>([emptyLine()]);
  const [overtime, setOvertime] = useState(false);
  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ open: boolean; line: number; search: string }>({
    open: false,
    line: 0,
    search: '',
  });

  // Load entities the employee may log against.
  useEffect(() => {
    if (!profile) return;
    fetchBusinessEntities(profile.business_access)
      .then((e) => {
        setEntities(e);
        setBusinessId((cur) => cur ?? e[0]?.id ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profile]);

  // When the business changes: load its projects and pre-fill the last-used project/location.
  useEffect(() => {
    if (!businessId || !profile) return;
    let active = true;
    setLoadingProjects(true);
    setProjects([]);
    (async () => {
      const [projs, recent] = await Promise.all([
        fetchProjects(businessId),
        fetchRecentTimesheets(profile.id, 20),
      ]);
      if (!active) return;
      setProjects(projs);
      const last = recent.find((r) => r.business_entity_id === businessId);
      const lastProject = last ? projs.find((p) => p.id === last.project_id) : undefined;
      setLines([
        {
          projectId: lastProject?.id ?? null,
          projectName: lastProject?.name ?? null,
          workLocation: (last?.work_location as WorkLocation) ?? 'site',
          hours: 8,
        },
      ]);
    })()
      .catch((err) => setError(err.message))
      .finally(() => setLoadingProjects(false));
    return () => {
      active = false;
    };
  }, [businessId, profile]);

  const totalHours = useMemo(
    () => Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100,
    [lines],
  );
  const canSubmit = businessId && lines.some((l) => l.projectId) && (!overtime || reason.trim().length > 0);

  const updateLine = (i: number, patch: Partial<TimesheetLine>) =>
    setLines((cur) => cur.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const filteredProjects = useMemo(() => {
    const q = picker.search.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, picker.search]);

  const onSubmit = useCallback(async () => {
    if (!profile || !businessId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitTimesheets({
        userId: profile.id,
        workDate,
        businessEntityId: businessId,
        lines,
        overtimeRequested: overtime,
        overtimeReason: overtime ? reason.trim() : null,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit timesheet.');
    } finally {
      setSubmitting(false);
    }
  }, [profile, businessId, workDate, lines, overtime, reason, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#1C1A16" />
      </View>
    );
  }

  const dateOptions = [todayISO(), addDays(todayISO(), -1), addDays(todayISO(), -2), addDays(todayISO(), -3)];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <ScrollView className="flex-1" contentContainerClassName="p-5 pb-32" keyboardShouldPersistTaps="handled">
        {/* Business */}
        {entities.length > 1 ? (
          <View className="mb-4">
            <Label>Business</Label>
            <View className="flex-row flex-wrap">
              {entities.map((e) => (
                <Chip key={e.id} label={e.name} selected={businessId === e.id} onPress={() => setBusinessId(e.id)} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Date */}
        <View className="mb-4">
          <Label>Day</Label>
          <View className="flex-row flex-wrap">
            {dateOptions.map((d) => (
              <Chip key={d} label={friendlyDate(d)} selected={workDate === d} onPress={() => setWorkDate(d)} />
            ))}
          </View>
        </View>

        {/* Lines */}
        <Label>Hours by project</Label>
        <View className="gap-3">
          {lines.map((line, i) => (
            <Card key={i}>
              <View className="flex-row justify-between items-center mb-3">
                <Pressable
                  className="flex-1 pr-2"
                  onPress={() => setPicker({ open: true, line: i, search: '' })}
                >
                  <Text className={`text-base font-semibold ${line.projectName ? 'text-ink' : 'text-muted'}`}>
                    {line.projectName ?? 'Select project ›'}
                  </Text>
                </Pressable>
                {lines.length > 1 ? (
                  <Pressable onPress={() => setLines((cur) => cur.filter((_, idx) => idx !== i))}>
                    <Text className="text-red-500 font-medium px-2">Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Location segmented toggle */}
              <View className="flex-row bg-gray-100 rounded-xl p-1 mb-3">
                {(['site', 'workshop'] as WorkLocation[]).map((loc) => (
                  <Pressable
                    key={loc}
                    onPress={() => updateLine(i, { workLocation: loc })}
                    className={`flex-1 py-2 rounded-lg items-center ${line.workLocation === loc ? 'bg-white' : ''}`}
                  >
                    <Text className={`font-medium capitalize ${line.workLocation === loc ? 'text-ink' : 'text-muted'}`}>
                      {loc === 'site' ? 'On Site' : 'Factory / Workshop'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Hours stepper */}
              <View className="flex-row items-center justify-between mb-3">
                <Pressable
                  onPress={() => updateLine(i, { hours: clampHours(line.hours - 0.5) })}
                  className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center"
                >
                  <Text className="text-2xl text-ink">−</Text>
                </Pressable>
                <Text className="text-3xl font-bold text-ink">{formatHours(line.hours)}</Text>
                <Pressable
                  onPress={() => updateLine(i, { hours: clampHours(line.hours + 0.5) })}
                  className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center"
                >
                  <Text className="text-2xl text-ink">＋</Text>
                </Pressable>
              </View>
              <View className="flex-row flex-wrap">
                {HOUR_CHIPS.map((h) => (
                  <Chip key={h} label={`${h}h`} selected={line.hours === h} onPress={() => updateLine(i, { hours: h })} />
                ))}
              </View>
            </Card>
          ))}
        </View>

        <Pressable
          onPress={() => setLines((cur) => [...cur, emptyLine()])}
          className="py-3 mt-1"
        >
          <Text className="text-brand font-semibold">＋ Add another project</Text>
        </Pressable>

        {/* Overtime */}
        <Card className="mt-2">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-ink">Overtime worked?</Text>
            <Switch
              value={overtime}
              onValueChange={setOvertime}
              trackColor={{ true: '#1C1A16', false: '#d1d5db' }}
            />
          </View>
          {overtime ? (
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason for overtime (required)"
              multiline
              className="border border-gray-300 rounded-xl px-4 py-3 mt-3 text-ink"
            />
          ) : null}
        </Card>

        {error ? <Text className="text-red-600 mt-3">{error}</Text> : null}
      </ScrollView>

      {/* Sticky submit bar */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-muted">Total today</Text>
          <Text className="text-xl font-bold text-ink">{formatHours(totalHours)}</Text>
        </View>
        <Button
          label="Submit Timesheet"
          loading={submitting}
          disabled={!canSubmit}
          onPress={onSubmit}
        />
      </View>

      {/* Project picker */}
      <Modal visible={picker.open} animationType="slide" onRequestClose={() => setPicker((p) => ({ ...p, open: false }))}>
        <SafeAreaView className="flex-1 bg-white">
          <View className="p-4 border-b border-gray-100 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">Select project</Text>
            <Pressable onPress={() => setPicker((p) => ({ ...p, open: false }))}>
              <Text className="text-brand font-semibold">Close</Text>
            </Pressable>
          </View>
          <TextInput
            value={picker.search}
            onChangeText={(t) => setPicker((p) => ({ ...p, search: t }))}
            placeholder="Search projects…"
            autoFocus
            className="m-4 border border-gray-300 rounded-xl px-4 py-3 text-ink"
          />
          {loadingProjects ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#1C1A16" />
            </View>
          ) : (
            <FlatList
              data={filteredProjects}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable
                  className="px-5 py-4 border-b border-gray-50"
                  onPress={() => {
                    updateLine(picker.line, { projectId: item.id, projectName: item.name });
                    setPicker((p) => ({ ...p, open: false }));
                  }}
                >
                  <Text className="text-base text-ink">{item.name}</Text>
                  {item.client ? <Text className="text-muted text-sm">{item.client}</Text> : null}
                </Pressable>
              )}
              ListEmptyComponent={
                <View className="items-center mt-12 px-8">
                  <Text className="text-muted text-center">
                    {picker.search
                      ? 'No projects match your search.'
                      : 'No active projects found.\nAsk an admin to create one in the dashboard.'}
                  </Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
