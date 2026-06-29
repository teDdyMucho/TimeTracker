import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Foreground notifications: show a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permission, obtain the Expo push token, and store it on the user's
 * profile so an Edge Function can dispatch notifications (PRD §18). Safely
 * no-ops on simulators / when permission is denied / before an EAS projectId
 * is configured.
 */
export async function registerPush(userId: string): Promise<void> {
  try {
    // Android requires a notification channel for sound/heads-up display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1C1A16',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // configured at EAS build time

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch (e) {
    console.warn('[push] registration skipped:', e);
  }
}
