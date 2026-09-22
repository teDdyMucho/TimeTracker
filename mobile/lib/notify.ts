import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      // A trigger without `type` matches no parser in expo-notifications and
      // means "fire now" — this reminder used to go off at the moment of clock-in.
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireDate },
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
      // Typed DAILY trigger: every day at 5:00 PM device-local time. (Untyped, it
      // fired once immediately when the toggle was switched on, and never again.)
      trigger: { type: SchedulableTriggerInputTypes.DAILY, hour: 17, minute: 0 },
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

// ── Morning clock-in reminders (client request, 23 Sep 2026) ─────────────────
//
// Two alerts, 6:50 AM and 7:10 AM, in the PHONE's local time — the OS resolves
// the hour, so each worker gets it at 6:50 wherever they are, and it fires with
// no signal. Scheduled as one-off notifications for the next CLOCK_IN_HORIZON_DAYS
// days (topped up every time the app opens) rather than one repeating trigger,
// so that clocking in cancels TODAY's remaining alerts — nobody gets "have you
// forgotten to clock in?" at 7:10 after clocking in at 6:58.

export interface ClockInReminder { hour: number; minute: number; title: string; body: string }

/** Wording is the client's, verbatim. */
export const CLOCK_IN_REMINDERS: ClockInReminder[] = [
  {
    hour: 6, minute: 50,
    title: 'Morning team, 10 minutes to go',
    body: 'Clock in when you arrive so your hours are recorded correctly.',
  },
  {
    hour: 7, minute: 10,
    title: "It's 7:10am, just checking you haven't forgotten to clock in",
    body: "Clock in straight away, or message the office if you're late or away.",
  },
];

/** Days the reminders fire — JS getDay(): 0 = Sunday … 6 = Saturday. Every day, as requested. */
export const CLOCK_IN_REMINDER_DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];

/** How many days ahead to keep scheduled. iOS allows 64 pending local notifications. */
export const CLOCK_IN_HORIZON_DAYS = 14;

const CLOCK_IN_KEY = 'timevera.clockInReminders';

/** date (YYYY-MM-DD, local) → scheduled ids. An EMPTY array means "handled" (cancelled / passed), so the day is never re-armed. */
type ClockInSchedule = Record<string, string[]>;

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function readClockInSchedule(): Promise<ClockInSchedule> {
  try {
    const raw = await AsyncStorage.getItem(CLOCK_IN_KEY);
    return raw ? (JSON.parse(raw) as ClockInSchedule) : {};
  } catch {
    return {};
  }
}

async function writeClockInSchedule(map: ClockInSchedule): Promise<void> {
  try {
    await AsyncStorage.setItem(CLOCK_IN_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

/**
 * Make sure the next CLOCK_IN_HORIZON_DAYS days of morning reminders are
 * scheduled. Safe to call on every app open: days already scheduled (or
 * handled) are skipped, past days are pruned. Returns how many notifications
 * were newly scheduled.
 */
export async function syncClockInReminders(
  opts: { now?: Date; days?: number[]; horizonDays?: number } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? CLOCK_IN_REMINDER_DAYS;
  const horizon = opts.horizonDays ?? CLOCK_IN_HORIZON_DAYS;
  try {
    if (!(await ensureNotifPermission())) return 0;
    const map = await readClockInSchedule();
    const todayKey = localDateKey(now);

    // Prune days that have passed.
    for (const k of Object.keys(map)) if (k < todayKey) delete map[k];

    let scheduled = 0;
    for (let i = 0; i < horizon; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const key = localDateKey(day);
      if (key in map) continue;                 // already scheduled, or handled
      if (!days.includes(day.getDay())) continue;

      const ids: string[] = [];
      for (const r of CLOCK_IN_REMINDERS) {
        const fireAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), r.hour, r.minute, 0, 0);
        if (fireAt.getTime() <= now.getTime()) continue; // this one's time has already passed today
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: r.title, body: r.body, sound: true },
          trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireAt },
        });
        ids.push(id);
        scheduled++;
      }
      // Record the day even if nothing was scheduled (all times passed) so it
      // isn't reconsidered on the next sync today.
      map[key] = ids;
    }
    await writeClockInSchedule(map);
    return scheduled;
  } catch (e) {
    console.warn('[notify] clock-in reminders sync failed', e);
    return 0;
  }
}

/** Called on clock-in: drop today's remaining morning reminders and mark the day handled. */
export async function cancelTodayClockInReminders(now: Date = new Date()): Promise<void> {
  try {
    const map = await readClockInSchedule();
    const key = localDateKey(now);
    for (const id of map[key] ?? []) await Notifications.cancelScheduledNotificationAsync(id);
    map[key] = [];
    await writeClockInSchedule(map);
  } catch (e) {
    console.warn('[notify] cancel today clock-in reminders failed', e);
  }
}

/** Called on sign-out / notifications switched off: remove every pending morning reminder. */
export async function cancelAllClockInReminders(): Promise<void> {
  try {
    const map = await readClockInSchedule();
    for (const ids of Object.values(map)) for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(CLOCK_IN_KEY);
  } catch (e) {
    console.warn('[notify] cancel all clock-in reminders failed', e);
  }
}
