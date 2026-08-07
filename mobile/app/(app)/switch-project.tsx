import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Chip, Label } from '@/components/ui';
import { useAuth } from '@/store/auth';
import {
  fetchActiveSession, fetchBusinessEntities, fetchProjects, switchProject,
} from '@/lib/queries';
import type { BusinessEntity, ClockSession, Project, WorkLocation } from '@/lib/types';

const MUTED = '#71717A';
const LINE = '#E4E4E7';

export default function SwitchProject() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);

  const [session, setSession] = useState<ClockSession | null>(null);
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workLocation, setWorkLocation] = useState<WorkLocation>('site');

  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const [s, e] = await Promise.all([
          fetchActiveSession(profile.id),
          fetchBusinessEntities(profile.business_access),
        ]);
        setSession(s);
        setEntities(e);
        setBusinessId(s?.business_entity_id ?? e[0]?.id ?? null);
        setWorkLocation(s?.work_location ?? 'site');
      } catch (err) {
        console.warn('[switch] load', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile]);

  // Load projects when the selected entity changes.
  useEffect(() => {
    if (!businessId) return;
    setLoadingProjects(true);
    fetchProjects(businessId)
      .then((p) => {
        setProjects(p);
        // Default to a project that isn't the current one.
        const firstOther = p.find((x) => x.id !== session?.project_id) ?? p[0];
        setProjectId(firstOther?.id ?? null);
      })
      .catch((e) => console.warn('[switch] projects', e))
      .finally(() => setLoadingProjects(false));
  }, [businessId, session?.project_id]);

  const doSwitch = useCallback(async () => {
    if (!session || !businessId || !projectId || switching) return;
    if (projectId === session.project_id && businessId === session.business_entity_id) {
      Alert.alert('Same project', 'Pick a different project to switch to.');
      return;
    }
    setSwitching(true);
    try {
      await switchProject({
        session,
        newBusinessEntityId: businessId,
        newProjectId: projectId,
        newWorkLocation: workLocation,
      });
      Alert.alert('Switched', 'Your hours were logged to the previous project and you are now clocked into the new one.');
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not switch project.');
    } finally {
      setSwitching(false);
    }
  }, [session, businessId, projectId, workLocation, switching, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper"><ActivityIndicator color="#1C1A16" /></View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-muted text-center">You are not clocked in. Clock in first before switching projects.</Text>
          <View className="h-4" />
          <Button label="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const currentProjectName = projects.find((p) => p.id === session.project_id)?.name;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <ScrollView className="flex-1" contentContainerClassName="p-5 pb-24">
        <View className="mb-4 rounded-2xl px-4 py-3.5" style={{ backgroundColor: 'rgba(28,26,22,0.06)', borderWidth: 1, borderColor: LINE }}>
          <Text className="text-muted text-xs uppercase tracking-wide mb-1">Currently on</Text>
          <Text className="font-bold text-ink text-base">{currentProjectName ?? 'Current project'}</Text>
          <Text className="text-muted text-sm mt-0.5">
            {session.work_location === 'site' ? 'On Site' : 'Factory / Workshop'}
          </Text>
        </View>

        <Text className="text-lg font-bold text-ink mb-1">Switch to another project</Text>
        <Text className="text-muted text-sm mb-4">
          Your current hours will be saved to {currentProjectName ? `“${currentProjectName}”` : 'the current project'}, and you&rsquo;ll be clocked into the new one — no new photo needed.
        </Text>

        {entities.length > 1 && (
          <>
            <Label>Company</Label>
            <View className="flex-row flex-wrap mt-1.5 mb-3">
              {entities.map((e) => (
                <Chip key={e.id} label={e.name} selected={businessId === e.id} onPress={() => setBusinessId(e.id)} />
              ))}
            </View>
          </>
        )}

        <Label>Project</Label>
        {loadingProjects ? (
          <View className="py-4"><ActivityIndicator color="#1C1A16" /></View>
        ) : projects.length === 0 ? (
          <Text className="text-muted text-sm mt-2 mb-3">No projects available for this company.</Text>
        ) : (
          <View className="flex-row flex-wrap mt-1.5 mb-3">
            {projects.map((p) => (
              <Chip
                key={p.id}
                label={p.id === session.project_id ? `${p.name} (current)` : p.name}
                selected={projectId === p.id}
                onPress={() => setProjectId(p.id)}
              />
            ))}
          </View>
        )}

        <Label>Work location</Label>
        <View className="flex-row flex-wrap mt-1.5 mb-4">
          <Chip label="On Site" selected={workLocation === 'site'} onPress={() => setWorkLocation('site')} />
          <Chip label="Factory / Workshop" selected={workLocation === 'workshop'} onPress={() => setWorkLocation('workshop')} />
        </View>

        <Button
          label={switching ? 'Switching…' : 'Switch Project'}
          loading={switching}
          disabled={switching || !projectId}
          onPress={doSwitch}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
