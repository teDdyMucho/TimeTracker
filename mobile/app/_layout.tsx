import '../global.css';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/store/auth';
import { isBiometricAvailable, getBiometricEnabled, authenticate } from '@/lib/biometric';
import AnimatedSplash from '@/components/animated-splash';

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const initializing = useAuth((s) => s.initializing);

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, initializing, segments, router]);
}

/** Locks the app behind Face ID / fingerprint on launch when the user enabled it. */
function useBiometricLock() {
  // Keyed on the user id, not the session object: the object is replaced on every
  // token refresh (~hourly), which re-locked the app in the middle of use.
  const userId = useAuth((s) => s.session?.user.id ?? null);
  const initializing = useAuth((s) => s.initializing);
  const [locked, setLocked] = useState(false);

  const tryUnlock = async () => {
    const ok = await authenticate();
    setLocked(!ok);
  };

  useEffect(() => {
    if (initializing || !userId) return;
    (async () => {
      if ((await getBiometricEnabled()) && (await isBiometricAvailable())) {
        setLocked(true);
        await tryUnlock();
      }
    })();
    // run once per session restore
  }, [initializing, userId]);

  return { locked, tryUnlock };
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: '#000000' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Image
        source={require('../assets/buildone.png')}
        style={{ width: 220, height: 56, marginBottom: 28, tintColor: '#FFFFFF' }}
        resizeMode="contain"
      />
      <Text className="text-white/70 mb-8 text-center">Locked — unlock to continue</Text>
      <Pressable onPress={onUnlock} className="rounded-2xl px-8 py-3" style={{ backgroundColor: '#FFFFFF' }}>
        <Text className="font-semibold text-base" style={{ color: '#000000' }}>Unlock</Text>
      </Pressable>
    </View>
  );
}

/**
 * Covers the app until the saved login has been restored. On a cold start the
 * token is usually expired and refreshing it can take many seconds on a weak
 * site signal — far longer than the ~2s splash. Without this the worker saw the
 * Home screen with no session behind it ("Welcome back, there", 0h, no
 * timesheets) and assumed their hours were gone.
 */
function StartupHold() {
  return (
    <View
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center',
        zIndex: 90, // sits under AnimatedSplash (100) so the hand-off is seamless
      }}
    >
      <Image
        source={require('../assets/buildone.png')}
        style={{ width: 240, height: 60, tintColor: '#FFFFFF', marginBottom: 28 }}
        resizeMode="contain"
      />
      <ActivityIndicator color="#FFFFFF" />
      <Text className="text-white/70 mt-4">Signing you in…</Text>
    </View>
  );
}

export default function RootLayout() {
  const init = useAuth((s) => s.init);
  const initializing = useAuth((s) => s.initializing);
  useEffect(() => init(), [init]);
  useProtectedRoute();
  const { locked, tryUnlock } = useBiometricLock();

  // Branded open animation (logo → app). Shows once per cold start.
  const [splashDone, setSplashDone] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar style={locked || !splashDone || initializing ? 'light' : 'dark'} />
      {locked ? <LockScreen onUnlock={tryUnlock} /> : <Stack screenOptions={{ headerShown: false }} />}
      {initializing && <StartupHold />}
      {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}
