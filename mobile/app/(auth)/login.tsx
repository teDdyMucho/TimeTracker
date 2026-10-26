import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, AppModal } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { supabase } from '@/lib/supabase';

const LINE = '#E4E4E7';
const BRONZE = '#1C1A16';

export default function Login() {
  const { signIn, signingIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [info, setInfo] = useState<{ title: string; message: string } | null>(null);
  const pwRef = useRef<TextInput>(null);

  // Entrance animation — logo + form rise/fade in as the splash clears.
  const logoIn = useRef(new Animated.Value(0)).current;
  const formIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(logoIn, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(formIn, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);
  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  const forgotPassword = async () => {
    if (!email.trim()) {
      setInfo({ title: 'Enter your email', message: 'Type your email above first, then tap "Forgot password?" to get a reset link.' });
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setInfo(
      err
        ? { title: 'Something went wrong', message: err.message }
        : { title: 'Check your email', message: `We've sent a password reset link to ${email.trim()}.` },
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#F4F4F5' }}>
      {/* The keyboard used to cover the password field on iPhones and the page
          could not be scrolled (Build One, 26 Oct 2026). The form now sits in a
          scroll view that shrinks above the keyboard and scrolls the focused
          field into view. */}
      {/* 'padding' on BOTH platforms: SDK 54 apps draw edge-to-edge on Android,
          where the old "resize the window" mode no longer shrinks the page, so
          the keyboard inset has to be handled here too. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View className="items-center mb-10" style={rise(logoIn)}>
          {/* BuildOne (unchanged) */}
          <Image
            source={require('../../assets/buildone.png')}
            style={{ width: 210, height: 54 }}
            resizeMode="contain"
          />

          {/* divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16, width: 200 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} />
            <Text style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, letterSpacing: 2, marginHorizontal: 10 }}>×</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} />
          </View>

          {/* ARKO (client) — transparent dark logo, sits directly on the light page */}
          <Image
            source={require('../../assets/arko-dark.png')}
            style={{ width: 170, height: 60 }}
            resizeMode="contain"
          />

          <Text className="mt-5" style={{ color: '#3F3F46' }}>Sign in to log your hours</Text>
        </Animated.View>

        <Animated.View className="gap-3" style={rise(formIn)}>
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#3F3F46' }}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => pwRef.current?.focus()}
              placeholder="you@timevera.com"
              placeholderTextColor="#71717A"
              className="bg-white text-ink text-base rounded-2xl px-4 py-4"
              style={{ borderWidth: 1, borderColor: '#C4C4CA' }}
            />
          </View>
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#3F3F46' }}>Password</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                ref={pwRef}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => { if (email && password && !signingIn) signIn(email, password); }}
                placeholder="••••••••"
                placeholderTextColor="#71717A"
                className="bg-white text-ink text-base rounded-2xl px-4 py-4 pr-12"
                style={{ borderWidth: 1, borderColor: '#C4C4CA' }}
              />
              <Pressable
                onPress={() => setShowPw((v) => !v)}
                hitSlop={10}
                style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
              >
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color="#71717A" />
              </Pressable>
            </View>
          </View>

          {error ? <Text className="text-sm" style={{ color: '#DC2626' }}>{error}</Text> : null}

          <Pressable onPress={forgotPassword} className="self-end py-1">
            <Text className="text-sm font-semibold" style={{ color: '#1C1A16' }}>Forgot password?</Text>
          </Pressable>

          <View className="mt-1">
            <Button
              label="Sign In"
              loading={signingIn}
              disabled={!email || !password}
              onPress={() => signIn(email, password)}
            />
          </View>
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>

      <AppModal
        visible={!!info}
        title={info?.title ?? ''}
        message={info?.message}
        onClose={() => setInfo(null)}
      />
    </SafeAreaView>
  );
}
