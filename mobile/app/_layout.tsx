import '../global.css';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
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
  const session = useAuth((s) => s.session);
  const initializing = useAuth((s) => s.initializing);
  const [locked, setLocked] = useState(false);

  const tryUnlock = async () => {
    const ok = await authenticate();
    setLocked(!ok);
  };

  useEffect(() => {
    if (initializing || !session) return;
    (async () => {
      if ((await getBiometricEnabled()) && (await isBiometricAvailable())) {
        setLocked(true);
        await tryUnlock();
      }
    })();
    // run once per session restore
  }, [initializing, session]);

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

export default function RootLayout() {
  const init = useAuth((s) => s.init);
  useEffect(() => init(), [init]);
  useProtectedRoute();
  const { locked, tryUnlock } = useBiometricLock();

  // Branded open animation (logo → app). Shows once per cold start.
  const [splashDone, setSplashDone] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar style={locked || !splashDone ? 'light' : 'dark'} />
      {locked ? <LockScreen onUnlock={tryUnlock} /> : <Stack screenOptions={{ headerShown: false }} />}
      {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}
