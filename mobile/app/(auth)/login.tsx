import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, TextInput, View } from 'react-native';
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
  const [info, setInfo] = useState<{ title: string; message: string } | null>(null);

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
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 justify-center px-6">
        <Animated.View className="items-center mb-10" style={rise(logoIn)}>
          {/* BuildOne logo */}
          <Image
            source={require('../../assets/buildone.png')}
            style={{ width: 230, height: 58 }}
            resizeMode="contain"
          />
          <Text className="text-muted mt-3">Sign in to log your hours</Text>
        </Animated.View>

        <Animated.View className="gap-3" style={rise(formIn)}>
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@buildone.com"
              placeholderTextColor="#A1A1AA"
              className="bg-white text-ink text-base rounded-2xl px-4 py-4"
              style={{ borderWidth: 1, borderColor: LINE }}
            />
          </View>
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#A1A1AA"
              className="bg-white text-ink text-base rounded-2xl px-4 py-4"
              style={{ borderWidth: 1, borderColor: LINE }}
            />
          </View>

          {error ? <Text className="text-red-600 text-sm">{error}</Text> : null}

          <Pressable onPress={forgotPassword} className="self-end py-1">
            <Text className="text-sm font-semibold" style={{ color: BRONZE }}>Forgot password?</Text>
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
      </View>

      <AppModal
        visible={!!info}
        title={info?.title ?? ''}
        message={info?.message}
        onClose={() => setInfo(null)}
      />
    </SafeAreaView>
  );
}
