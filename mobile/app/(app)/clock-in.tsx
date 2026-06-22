import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
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
  fetchBusinessEntities,
  fetchProjects,
  uploadSelfie,
} from '@/lib/queries';
import { todayISO } from '@/lib/date';
import { Button, Card, Chip, Label } from '@/components/ui';
import type { BusinessEntity, Project, WorkLocation } from '@/lib/types';

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

  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load entities
  useEffect(() => {
    if (!profile) return;
    fetchBusinessEntities(profile.business_access)
      .then((e) => {
        setEntities(e);
        setBusinessId(e[0]?.id ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingEntities(false));
  }, [profile]);

  // Load projects when entity changes
  useEffect(() => {
    if (!businessId) return;
    setLoadingProjects(true);
    setProjects([]);
    setProjectId(null);
    fetchProjects(businessId)
      .then((p) => {
        setProjects(p);
        setProjectId(p[0]?.id ?? null);
      })
      .catch((err) => setError(err.message))
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

    // Grab GPS + reverse geocode address at same time as selfie
    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setLocation({ lat: latitude, lng: longitude });

      // Reverse geocode to human-readable address
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) {
          const parts = [place.streetNumber, place.street, place.suburb, place.city, place.region]
            .filter(Boolean);
          setAddress(parts.join(', '));
        }
      } catch (_) {}
    }

    setStep('details');
  }, []);

  const onClockIn = useCallback(async () => {
    if (!profile || !businessId || !projectId) return;
    setSubmitting(true);
    setError(null);
    try {
      let selfieUrl: string | null = null;
      if (selfieUri) {
        selfieUrl = await uploadSelfie(profile.id, selfieUri);
        if (!selfieUrl) {
          setError('Photo upload failed. Check your connection and try again.');
          setSubmitting(false);
          return;
        }
      }
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
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clock in.');
      setSubmitting(false);
    }
  }, [profile, businessId, projectId, workLocation, location, selfieUri, router]);

  // ── Step 1: Take selfie ───────────────────────────────────────────────────
  if (step === 'selfie') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-ink">Clock In</Text>
          <Pressable onPress={() => router.back()}>
            <Text className="text-brand font-semibold text-base">Cancel</Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-8">
          <View className="w-40 h-40 rounded-full bg-gray-100 items-center justify-center mb-6">
            <Text className="text-6xl">🤳</Text>
          </View>
          <Text className="text-xl font-bold text-ink text-center mb-2">Take a selfie</Text>
          <Text className="text-muted text-center mb-8">
            A photo is required to verify you're on location when clocking in.
            Your GPS is also captured automatically.
          </Text>
          <Button label="Open Camera" onPress={takeSelfie} className="w-full" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 2: Pick project & confirm ───────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2 bg-white border-b border-gray-100">
        <Text className="text-2xl font-bold text-ink">Clock In</Text>
        <Pressable onPress={() => router.back()}>
          <Text className="text-brand font-semibold text-base">Cancel</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 p-5" contentContainerClassName="gap-4">
        {/* Selfie preview */}
        <Card>
          <View className="flex-row items-center gap-4">
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} className="w-16 h-16 rounded-full" />
            ) : (
              <View className="w-16 h-16 rounded-full bg-gray-200 items-center justify-center">
                <Text className="text-2xl">🤳</Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="font-semibold text-ink">Selfie captured</Text>
              <Text className="text-muted text-sm">
                {address
                  ? `📍 ${address}`
                  : location
                  ? `📍 ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                  : '📍 Location not captured'}
              </Text>
            </View>
            <Pressable onPress={() => setStep('selfie')}>
              <Text className="text-brand text-sm font-medium">Retake</Text>
            </Pressable>
          </View>
        </Card>

        {/* Business entity */}
        {loadingEntities ? (
          <ActivityIndicator color="#0ABFA3" />
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
            <ActivityIndicator color="#0ABFA3" />
          ) : projects.length === 0 ? (
            <Text className="text-muted text-sm">No active projects. Ask an admin to create one.</Text>
          ) : (
            <View className="gap-2">
              {projects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.8}
                  onPress={() => setProjectId(p.id)}
                  style={{
                    borderWidth: 1.5,
                    borderColor: projectId === p.id ? '#0ABFA3' : '#e5e7eb',
                    backgroundColor: projectId === p.id ? '#f0fdfb' : '#ffffff',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ fontWeight: '600', color: projectId === p.id ? '#0ABFA3' : '#101113' }}>
                    {p.name}
                  </Text>
                  {p.client ? (
                    <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{p.client}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Work location */}
        <View>
          <Label>Where are you working?</Label>
          <View className="flex-row bg-gray-100 rounded-xl p-1">
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
                <Text style={{ fontWeight: '600', color: workLocation === loc ? '#101113' : '#6b7280' }}>
                  {loc === 'site' ? '🏗  On Site' : '🏭  Factory / Workshop'}
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
      <View className="p-5 bg-white border-t border-gray-100">
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
