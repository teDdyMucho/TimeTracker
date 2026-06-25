import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const REMINDER_KEY = 'clockOutReminderId';
const DAILY_KEY = 'dailyTimesheetReminderId';
const STANDARD_DAY_HOURS = 8;

/** Ask for notification permission (no-op if already granted). Returns true if allowed. */
export async function ensureNotifPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

/**
 * Schedule a local "time to clock out" reminder 8 hours after clock-in.
 * Fires even if the app is closed. Replaces any existing reminder.
 */
export async function scheduleClockOutReminder(clockedInAtISO: string): Promise<boolean> {
  try {
    if (!(await ensureNotifPermission())) return false;
    await cancelClockOutReminder();

    const target = new Date(clockedInAtISO).getTime() + STANDARD_DAY_HOURS * 3_600_000;
    const fireDate = new Date(Math.max(Date.now() + 1000, target));

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to clock out',
        body: "You've reached 8 hours on the clock — don't forget to clock out.",
        sound: true,
      },
      // Date trigger: fire at the exact 8-hour mark.
      trigger: { date: fireDate } as any,
    });
    await SecureStore.setItemAsync(REMINDER_KEY, id);
    return true;
  } catch (e) {
    console.warn('[notify] schedule failed', e);
    return false;
  }
}

/** Cancel a pending clock-out reminder (called on clock-out). */
export async function cancelClockOutReminder(): Promise<void> {
  try {
    const id = await SecureStore.getItemAsync(REMINDER_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await SecureStore.deleteItemAsync(REMINDER_KEY);
    }
  } catch (e) {
    console.warn('[notify] cancel failed', e);
  }
}

/** Daily 5pm reminder to log hours (the PRD "missing timesheet reminder"). */
export async function scheduleDailyTimesheetReminder(): Promise<void> {
  try {
    if (!(await ensureNotifPermission())) return;
    await cancelDailyTimesheetReminder();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Log your hours',
        body: "Don't forget to log today's hours before you finish up.",
        sound: true,
      },
      trigger: { hour: 17, minute: 0, repeats: true } as any, // every day at 5:00 PM
    });
    await SecureStore.setItemAsync(DAILY_KEY, id);
  } catch (e) {
    console.warn('[notify] daily reminder failed', e);
  }
}

export async function cancelDailyTimesheetReminder(): Promise<void> {
  try {
    const id = await SecureStore.getItemAsync(DAILY_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await SecureStore.deleteItemAsync(DAILY_KEY);
    }
  } catch (e) {
    console.warn('[notify] cancel daily failed', e);
  }
}
