/**
 * Server-side push sender. Posts to Expo's Push API so a notification is
 * delivered to the employee's phone (works once they're on an EAS build —
 * Expo Go cannot receive remote push since SDK 53).
 *
 * Usage (from a server action): await sendPushToProfile(adminClient, profileId, {...})
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, unknown>
}

/** Look up a profile's Expo push token and send a notification. Best-effort: never throws. */
export async function sendPushToProfile(
  admin: SupabaseClient,
  profileId: string,
  message: PushMessage,
): Promise<void> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('expo_push_token, notifications_enabled')
      .eq('id', profileId)
      .maybeSingle()

    const token = data?.expo_push_token as string | null
    // Respect the user's notification toggle; skip if no token (not on a build yet).
    if (!token || data?.notifications_enabled === false) return
    if (!token.startsWith('ExponentPushToken') && !token.startsWith('ExpoPushToken')) return

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        priority: 'high',
        channelId: 'default',
      }),
    })
  } catch (e) {
    console.warn('[push] send skipped:', e)
  }
}
