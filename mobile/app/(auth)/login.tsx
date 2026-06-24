import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useAuth } from '@/store/auth';

const LINE = '#E7E2D8';

export default function Login() {
  const { signIn, signingIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 justify-center px-6">
        <View className="items-center mb-10">
          {/* Build One bronze logo mark */}
          <View className="w-16 h-16 rounded-2xl bg-brand items-center justify-center mb-4">
            <Text className="text-white text-2xl font-bold">B1</Text>
          </View>
          <Text className="text-2xl font-bold text-ink">Build One Timesheets</Text>
          <Text className="text-muted mt-1">Sign in to log your hours</Text>
        </View>

        <View className="gap-3">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@buildone.com"
              placeholderTextColor="#A39C90"
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
              placeholderTextColor="#A39C90"
              className="bg-white text-ink text-base rounded-2xl px-4 py-4"
              style={{ borderWidth: 1, borderColor: LINE }}
            />
          </View>

          {error ? <Text className="text-red-600 text-sm">{error}</Text> : null}

          <View className="mt-2">
            <Button
              label="Sign In"
              loading={signingIn}
              disabled={!email || !password}
              onPress={() => signIn(email, password)}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
