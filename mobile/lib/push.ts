import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { decideOvertime } from './queries';

/** Category the server attaches to an "overtime_request" push (TV3). */
export const OVERTIME_CATEGORY = 'overtime_approval';

/** Register the Approve / Reject buttons shown on an overtime request push. */
export async function registerNotificationCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(OVERTIME_CATEGORY, [
      { identifier: 'approve', buttonTitle: 'Approve', options: { opensAppToForeground: false } },
      { identifier: 'reject', buttonTitle: 'Reject', options: { opensAppToForeground: false, isDestructive: true } },
    ]);
  } catch (e) {
    console.warn('[push] categories skipped:', e);
  }
}

/**
 * Handle a tap on an overtime push: the Approve / Reject buttons decide it in
 * place; tapping the body opens the Approvals screen. Returns the subscription
 * remover. `openApprovals` is the navigation callback.
 */
export function installNotificationResponseHandler(openApprovals: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(async (resp) => {
    const data = (resp.notification.request.content.data ?? {}) as { type?: string; requestId?: string };
    if (data.type !== 'overtime_request' || !data.requestId) return;
    const action = resp.actionIdentifier;
    if (action === 'approve' || action === 'reject') {
      const decision = action === 'approve' ? 'approved' : 'rejected';
      try {
        await decideOvertime(data.requestId, decision);
        await Notifications.scheduleNotificationAsync({
          content: { title: decision === 'approved' ? 'Overtime approved' : 'Overtime rejected', body: 'The worker has been told.', sound: false },
          trigger: null,
        });
      } catch (e) {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Could not record your decision', body: e instanceof Error ? e.message : 'Open the app and try again.', sound: false },
          trigger: null,
        });
      }
      return;
    }
    openApprovals();
  });
  return () => sub.remove();
}

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
    await registerNotificationCategories();
  } catch (e) {
    console.warn('[push] registration skipped:', e);
  }
}
