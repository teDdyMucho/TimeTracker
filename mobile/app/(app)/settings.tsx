import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Label, AppModal } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { uploadAvatar, updateMyProfile } from '@/lib/queries';
import {
  ensureNotifPermission,
  cancelClockOutReminder,
  scheduleDailyTimesheetReminder,
  cancelDailyTimesheetReminder,
} from '@/lib/notify';
import { isBiometricAvailable, getBiometricEnabled, setBiometricEnabled } from '@/lib/biometric';

const BRONZE = '#9A7A4E';
const LINE = '#E7E2D8';
const MUTED = '#76716A';

export default function Settings() {
  const profile = useAuth((s) => s.profile);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const signOut = useAuth((s) => s.signOut);

  const [uploading, setUploading] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwDoneOpen, setPwDoneOpen] = useState(false);
  const [notif, setNotif] = useState(profile?.notifications_enabled ?? true);
  const [savingNotif, setSavingNotif] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const initial = (profile?.name?.[0] ?? 'U').toUpperCase();

  useEffect(() => {
    (async () => {
      setBioAvailable(await isBiometricAvailable());
      setBioOn(await getBiometricEnabled());
    })();
  }, []);

  const toggleBiometric = async (value: boolean) => {
    setBioOn(value);
    await setBiometricEnabled(value);
  };

  // ── Profile photo ──────────────────────────────────────────────
  const changePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !profile) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(profile.id, result.assets[0].uri);
      if (!url) throw new Error('Upload failed');
      await updateMyProfile(profile.id, { avatar_url: url });
      await refreshProfile();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update photo.');
    } finally {
      setUploading(false);
    }
  };

  // ── Password ───────────────────────────────────────────────────
  const savePassword = async () => {
    if (pw.length < 8) return Alert.alert('Weak password', 'Use at least 8 characters.');
    if (pw !== pw2) return Alert.alert('Mismatch', 'Passwords do not match.');
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw(''); setPw2('');
      setShowPw(false); setShowPw2(false);
      setPwDoneOpen(true);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setSavingPw(false);
    }
  };

  // ── Notifications ──────────────────────────────────────────────
  const toggleNotif = async (value: boolean) => {
    if (!profile) return;
    setNotif(value);
    setSavingNotif(true);
    try {
      if (value) {
        const ok = await ensureNotifPermission();
        if (!ok) {
          setNotif(false);
          Alert.alert('Permission needed', 'Enable notifications for this app in your phone settings.');
          return;
        }
        await scheduleDailyTimesheetReminder();
      } else {
        await cancelClockOutReminder();
        await cancelDailyTimesheetReminder();
      }
      await updateMyProfile(profile.id, { notifications_enabled: value });
      await refreshProfile();
    } catch (e) {
      setNotif(!value);
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update setting.');
    } finally {
      setSavingNotif(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="p-5 pb-20 gap-4">
      {/* Profile photo */}
      <Card>
        <Label>Profile photo</Label>
        <View className="flex-row items-center gap-4 mt-1">
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: LINE }} />
          ) : (
            <View className="items-center justify-center" style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: BRONZE }}>
              <Text className="text-white text-2xl font-bold">{initial}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="font-semibold text-ink">{profile?.name}</Text>
            <Text className="text-muted text-sm mb-2">{profile?.email}</Text>
            <Pressable
              onPress={changePhoto}
              disabled={uploading}
              className="self-start rounded-xl px-4 py-2"
              style={{ backgroundColor: 'rgba(154,122,78,0.12)' }}
            >
              {uploading ? (
                <ActivityIndicator color={BRONZE} />
              ) : (
                <Text className="font-semibold" style={{ color: BRONZE }}>Change photo</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Card>

      {/* Notifications */}
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="font-semibold text-ink">Notifications</Text>
            <Text className="text-muted text-sm mt-0.5">
              Remind me to clock out after 8 hours on the clock.
            </Text>
          </View>
          {savingNotif ? (
            <ActivityIndicator color={BRONZE} />
          ) : (
            <Switch value={notif} onValueChange={toggleNotif} trackColor={{ true: BRONZE, false: '#D9D3C8' }} thumbColor="#fff" />
          )}
        </View>
      </Card>

      {/* Face ID / biometric unlock (only if the device supports it) */}
      {bioAvailable && (
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-semibold text-ink">Unlock with Face ID / fingerprint</Text>
              <Text className="text-muted text-sm mt-0.5">
                Require biometrics each time the app is opened.
              </Text>
            </View>
            <Switch value={bioOn} onValueChange={toggleBiometric} trackColor={{ true: BRONZE, false: '#D9D3C8' }} thumbColor="#fff" />
          </View>
        </Card>
      )}

      {/* Change password */}
      <Card>
        <Label>Change password</Label>
        <View className="relative mt-1">
          <TextInput
            value={pw}
            onChangeText={setPw}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            placeholder="New password (min 8 chars)"
            placeholderTextColor={MUTED}
            className="bg-white text-ink rounded-xl pl-4 pr-12 py-3"
            style={{ borderWidth: 1, borderColor: LINE }}
          />
          <Pressable
            onPress={() => setShowPw((v) => !v)}
            hitSlop={10}
            className="absolute right-3 top-0 bottom-0 justify-center"
          >
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={21} color={MUTED} />
          </Pressable>
        </View>
        <View className="relative mt-3">
          <TextInput
            value={pw2}
            onChangeText={setPw2}
            secureTextEntry={!showPw2}
            autoCapitalize="none"
            placeholder="Confirm new password"
            placeholderTextColor={MUTED}
            className="bg-white text-ink rounded-xl pl-4 pr-12 py-3"
            style={{ borderWidth: 1, borderColor: LINE }}
          />
          <Pressable
            onPress={() => setShowPw2((v) => !v)}
            hitSlop={10}
            className="absolute right-3 top-0 bottom-0 justify-center"
          >
            <Ionicons name={showPw2 ? 'eye-off-outline' : 'eye-outline'} size={21} color={MUTED} />
          </Pressable>
        </View>
        <View className="mt-3">
          <Button
            label="Update password"
            loading={savingPw}
            disabled={savingPw || !pw || !pw2}
            onPress={savePassword}
          />
        </View>
      </Card>

      {/* Sign out */}
      <Pressable
        onPress={() => setSignOutOpen(true)}
        className="items-center justify-center rounded-2xl py-4 mt-1"
        style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}
      >
        <Text className="font-semibold" style={{ color: '#DC2626' }}>Sign out</Text>
      </Pressable>

      <AppModal
        visible={pwDoneOpen}
        title="Password updated"
        message="Your password has been changed. Use it the next time you sign in."
        confirmLabel="Got it"
        onConfirm={() => setPwDoneOpen(false)}
        onClose={() => setPwDoneOpen(false)}
      />

      <AppModal
        visible={signOutOpen}
        title="Sign out?"
        message="You'll need to sign in again to log your hours."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => { setSignOutOpen(false); signOut(); }}
        onClose={() => setSignOutOpen(false)}
      />
    </ScrollView>
  );
}
