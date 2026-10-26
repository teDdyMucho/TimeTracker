import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '@/store/auth';
import {
  clockIn,
  fetchBusinessEntitiesCached,
  fetchProjectsCached,
  isSessionExpired,
  uploadSelfie,
} from '@/lib/queries';
import { todayISO } from '@/lib/date';
import { scheduleClockOutReminder, cancelTodayClockInReminders } from '@/lib/notify';
import { clockInMessage, filterProjects, shouldShowProjectSearch } from '@/lib/clock-feedback';
import { probeOnline, queueClockIn, readCachedSession, readQueue } from '@/lib/offline';
import { isNetworkError, resolveShownSession } from '@/lib/offline-core';
import { Button, Card, Chip, Label } from '@/components/ui';
import type { BusinessEntity, Project, WorkLocation } from '@/lib/types';

// Build One palette
const BRONZE = '#1C1A16';
const INK    = '#18181B';
const MUTED  = '#71717A';
const LINE   = '#E4E4E7';
const STONE  = '#F4F4F5';

export default function ClockInScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);

  const [step, setStep] = useState<'selfie' | 'details'>('selfie');
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workLocation, setWorkLocation] = useState<WorkLocation>('site');

  const [projectSearch, setProjectSearch] = useState('');

  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The lists came from this phone's cache because there is no connection.
  const [offlineList, setOfflineList] = useState(false);

  const listError = (err: unknown) =>
    isNetworkError(err)
      ? 'No connection, and this phone has not loaded the project list yet. Connect once, then try again.'
      : err instanceof Error ? err.message : 'Could not load the list.';

  useEffect(() => {
    if (!profile) return;
    fetchBusinessEntitiesCached(profile.business_access)
      .then(({ data: e, fromCache }) => {
        setEntities(e);
        setBusinessId(e[0]?.id ?? null);
        if (fromCache) setOfflineList(true);
      })
      .catch((err) => setError(listError(err)))
      .finally(() => setLoadingEntities(false));
  }, [profile]);

  useEffect(() => {
    if (!businessId) return;
    setLoadingProjects(true);
    setProjects([]);
    setProjectId(null);
    setProjectSearch(''); // a filter typed for one business must not hide the next one's projects
    fetchProjectsCached(businessId)
      .then(({ data: p, fromCache }) => {
        setProjects(p);
        setProjectId(p[0]?.id ?? null);
        if (fromCache) setOfflineList(true);
      })
      .catch((err) => setError(listError(err)))
      .finally(() => setLoadingProjects(false));
  }, [businessId]);

  const takeSelfie = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take your selfie.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled) return;
    setSelfieUri(result.assets[0].uri);

    // Location is best-effort: a phone with location services off (or no GPS
    // fix yet) used to throw here, which left the worker stuck on the selfie
    // step. Now we fall back to the last known position, then to no location,
    // and always continue — the admin still sees the photo and timestamp.
    try {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus === 'granted') {
        let loc: Location.LocationObject | null = null;
        try {
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch (_) {
          loc = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
        }
        if (loc) {
          const { latitude, longitude } = loc.coords;
          setLocation({ lat: latitude, lng: longitude });
          try {
            const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (place) {
              const parts = [place.streetNumber, place.street, place.district, place.city, place.region]
                .filter(Boolean);
              setAddress(parts.join(', '));
            }
          } catch (_) {}
        }
      }
    } catch (_) {
      // permission prompt failed — continue without location
    }
    setStep('details');
  }, []);

  const onClockIn = useCallback(async () => {
    if (!profile || !businessId || !projectId) return;
    setSubmitting(true);
    setError(null);

    // No connection: keep the clock-in (and the selfie) on the phone; it is
    // sent automatically when the signal is back (PRD "offline capture").
    const saveOffline = async (selfieUrl: string | null) => {
      await queueClockIn({
        userId: profile.id,
        businessEntityId: businessId,
        projectId,
        workLocation,
        workDate: todayISO(),
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        address: address ?? null,
        selfieUri: selfieUrl ? null : selfieUri,
        selfieUrl,
      });
      await cancelTodayClockInReminders();
      // People with a personal auto clock-out threshold (Robbie, Chris: 14 h) are not
      // subject to the 3:06 pm rule, so the "clock out by 3:06" reminder is not for them.
      if (profile.notifications_enabled !== false && profile.auto_clockout_hours == null) {
        await scheduleClockOutReminder(new Date().toISOString());
      }
      const projectName = projects.find((p) => p.id === projectId)?.name ?? 'your project';
      router.replace('/');
      Alert.alert(
        'Saved on your phone',
        `No connection right now. You're clocked in for ${projectName} on this phone, and it will be sent to the office automatically when you're back online.`,
      );
    };

    // Already on the clock — a clock-in waiting in the queue, or the server
    // session this phone saw before the signal dropped (unless its clock-out
    // is already queued)? A second clock-in would leave the first one open
    // until the 16-hour cap, so refuse it here.
    const cached = await readCachedSession(profile.id);
    const known = resolveShownSession(await readQueue(profile.id), cached && !isSessionExpired(cached) ? cached : null);
    if (known) {
      setSubmitting(false);
      Alert.alert(
        'Already clocked in',
        'You are still on the clock from earlier. Go back to Home and clock out first (pull down to refresh once you have signal).',
      );
      return;
    }

    try {
      let selfieUrl: string | null = null;
      if (selfieUri) {
        try {
          selfieUrl = await uploadSelfie(profile.id, selfieUri, { throwOnNetwork: true });
        } catch (err) {
          if (isNetworkError(err)) {
            await saveOffline(null);
            return;
          }
          throw err;
        }
        if (!selfieUrl) {
          // No token (the saved login expired and could not refresh) or a
          // storage rejection. With no signal, keep the clock-in on the phone.
          if (!(await probeOnline())) {
            await saveOffline(null);
            return;
          }
          setError('Photo upload failed. Please try again.');
          setSubmitting(false);
          return;
        }
      }
      try {
        await clockIn({
          userId: profile.id,
          businessEntityId: businessId,
          projectId,
          workLocation,
          workDate: todayISO(),
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          selfieUrl,
          address: address ?? null,
        });
      } catch (err) {
        if (isNetworkError(err)) {
          await saveOffline(selfieUrl);
          return;
        }
        throw err;
      }
      // Clocked in — today's morning "have you clocked in?" alerts are moot.
      await cancelTodayClockInReminders();
      // Arm the 2:55 pm "clock out by 3:06" reminder (weekdays, unless disabled)
      // People with a personal auto clock-out threshold (Robbie, Chris: 14 h) are not
      // subject to the 3:06 pm rule, so the "clock out by 3:06" reminder is not for them.
      if (profile.notifications_enabled !== false && profile.auto_clockout_hours == null) {
        await scheduleClockOutReminder(new Date().toISOString());
      }
      // PRD §7 confirmation — a visible "you're on the clock" acknowledgement.
      const msg = clockInMessage(projects.find((p) => p.id === projectId)?.name);
      router.replace('/');
      Alert.alert(msg.title, msg.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clock in.');
      setSubmitting(false);
    }
  }, [profile, businessId, projectId, workLocation, location, address, selfieUri, router, projects]);

  // PRD §7 "Searchable dropdown": filter the project list by name / client.
  const visibleProjects = filterProjects(projects, projectSearch);

  // ── Step 1: Take selfie ───────────────────────────────────────────────────
  if (step === 'selfie') {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-ink">Clock In</Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="font-semibold text-base" style={{ color: BRONZE }}>Cancel</Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-8">
          {/* Camera-lens motif */}
          <View className="items-center justify-center mb-8" style={{ width: 184, height: 184 }}>
            <View style={{ position: 'absolute', width: 184, height: 184, borderRadius: 92, backgroundColor: 'rgba(28,26,22,0.08)' }} />
            <View style={{ position: 'absolute', width: 148, height: 148, borderRadius: 74, backgroundColor: 'rgba(28,26,22,0.12)' }} />
            <View
              className="items-center justify-center"
              style={{ width: 116, height: 116, borderRadius: 58, backgroundColor: '#fff', borderWidth: 2, borderColor: 'rgba(28,26,22,0.35)' }}
            >
              <View className="items-center justify-center" style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: BRONZE }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.4)' }} />
              </View>
            </View>
          </View>

          <Text className="text-2xl font-bold text-ink text-center mb-2">Take a selfie</Text>
          <Text className="text-muted text-center mb-6 leading-5" style={{ maxWidth: 300 }}>
            A quick photo verifies you&rsquo;re on site. Your location and time are captured automatically.
          </Text>

          {/* Info chips */}
          <View className="flex-row gap-2 mb-9">
            {['GPS captured', 'Time-stamped'].map((label) => (
              <View key={label} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(28,26,22,0.10)' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRONZE }} />
                <Text className="text-xs font-semibold" style={{ color: '#000000' }}>{label}</Text>
              </View>
            ))}
          </View>

          <Button label="Open Camera" onPress={takeSelfie} className="w-full" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 2: Pick project & confirm ───────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2 bg-white" style={{ borderBottomWidth: 1, borderBottomColor: LINE }}>
        <Text className="text-2xl font-bold text-ink">Clock In</Text>
        <Pressable onPress={() => router.back()}>
          <Text className="font-semibold text-base" style={{ color: BRONZE }}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 p-5" contentContainerClassName="gap-4">
        {/* Selfie preview */}
        <Card>
          <View className="flex-row items-center gap-4">
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} className="w-16 h-16 rounded-full" />
            ) : (
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: STONE }}>
                <Text className="text-2xl">📷</Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="font-semibold text-ink">Selfie captured</Text>
              <Text className="text-muted text-sm">
                {address
                  ? address
                  : location
                  ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                  : 'Location not captured'}
              </Text>
            </View>
            <Pressable onPress={() => setStep('selfie')}>
              <Text className="text-sm font-medium" style={{ color: BRONZE }}>Retake</Text>
            </Pressable>
          </View>
        </Card>

        {offlineList ? (
          <Text className="text-muted text-xs">No connection — showing the project list saved on this phone.</Text>
        ) : null}

        {/* Business entity */}
        {loadingEntities ? (
          <ActivityIndicator color={BRONZE} />
        ) : entities.length > 1 ? (
          <View>
            <Label>Business</Label>
            <View className="flex-row flex-wrap">
              {entities.map((e) => (
                <Chip
                  key={e.id}
                  label={e.name}
                  selected={businessId === e.id}
                  onPress={() => setBusinessId(e.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Project */}
        <View>
          <Label>Project</Label>
          {loadingProjects ? (
            <ActivityIndicator color={BRONZE} />
          ) : projects.length === 0 ? (
            <Text className="text-muted text-sm">No active projects. Ask an admin to create one.</Text>
          ) : (
            <View className="gap-2">
              {shouldShowProjectSearch(projects.length) && (
                <TextInput
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                  placeholder="Search projects…"
                  placeholderTextColor={MUTED}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  style={{
                    borderWidth: 1.5,
                    borderColor: LINE,
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    color: INK,
                    marginBottom: 4,
                  }}
                />
              )}
              {visibleProjects.length === 0 && (
                <Text className="text-muted text-sm">{`No projects match "${projectSearch.trim()}".`}</Text>
              )}
              {visibleProjects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.8}
                  onPress={() => setProjectId(p.id)}
                  style={{
                    borderWidth: 1.5,
                    borderColor: projectId === p.id ? BRONZE : LINE,
                    backgroundColor: projectId === p.id ? 'rgba(28,26,22,0.06)' : '#ffffff',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ fontWeight: '600', color: projectId === p.id ? BRONZE : INK }}>
                    {p.name}
                  </Text>
                  {p.client ? (
                    <Text style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>{p.client}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Work location */}
        <View>
          <Label>Where are you working?</Label>
          <View className="flex-row rounded-xl p-1" style={{ backgroundColor: STONE }}>
            {(['site', 'workshop'] as WorkLocation[]).map((loc) => (
              <TouchableOpacity
                key={loc}
                activeOpacity={0.8}
                onPress={() => setWorkLocation(loc)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderRadius: 10,
                  backgroundColor: workLocation === loc ? '#ffffff' : 'transparent',
                }}
              >
                <Text style={{ fontWeight: '600', color: workLocation === loc ? INK : MUTED }}>
                  {loc === 'site' ? 'On Site' : 'Factory / Workshop'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {error ? (
          <Text className="text-red-600 text-sm">{error}</Text>
        ) : null}
      </ScrollView>

      {/* Confirm button */}
      <View className="p-5 bg-white" style={{ borderTopWidth: 1, borderTopColor: LINE }}>
        <Button
          label={submitting ? 'Clocking in…' : 'Confirm Clock In'}
          loading={submitting}
          disabled={!projectId || submitting}
          onPress={onClockIn}
        />
      </View>
    </SafeAreaView>
  );
}
