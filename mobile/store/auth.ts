import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchProfile } from '@/lib/queries';
import { registerPush } from '@/lib/push';
import type { Profile } from '@/lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;
  signingIn: boolean;
  error: string | null;
  init: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// The profile is cached on the device so a cold start (the OS killed the app
// overnight) can show the worker's name, photo and hours straight away, even if
// the first network call of the morning fails on a weak site signal. Without it
// the app fell back to "Welcome back, there / T" with 0h until they re-signed in.
const PROFILE_CACHE_KEY = 'timevera.profile';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Longest the startup screen may wait for the saved login to be restored. */
const STARTUP_TIMEOUT_MS = 35_000;

async function readCachedProfile(userId: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Profile;
    // Never show one worker's cached profile under another worker's session.
    return cached?.id === userId ? cached : null;
  } catch {
    return null;
  }
}

async function writeCachedProfile(profile: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // cache is best-effort
  }
}

async function clearCachedProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}

/** fetchProfile returns null on ANY error, so retry before giving up. */
async function fetchProfileWithRetry(userId: string, attempts = 3): Promise<Profile | null> {
  for (let i = 0; i < attempts; i++) {
    const profile = await fetchProfile(userId);
    if (profile) return profile;
    if (i < attempts - 1) await wait(1500 * (i + 1));
  }
  return null;
}

export const useAuth = create<AuthState>((set, get) => {
  // One background profile sync per user at a time (init and the INITIAL_SESSION
  // event both ask for one on startup).
  const inflight = new Map<string, Promise<void>>();

  /**
   * Load the profile WITHOUT blocking the caller. auth-js awaits every
   * onAuthStateChange callback, so retrying inside one would stall sign-in and
   * token refresh for seconds. Results are dropped if the user signed out or
   * switched account while the fetch was running.
   */
  const syncProfile = (userId: string): Promise<void> => {
    const running = inflight.get(userId);
    if (running) return running;

    const task = (async () => {
      const fresh = await fetchProfileWithRetry(userId);
      if (get().session?.user.id !== userId) return; // stale: signed out / switched
      if (fresh) {
        set({ profile: fresh });
        await writeCachedProfile(fresh);
        return;
      }
      // Fetch failed — never wipe a good profile. Keep the one in memory if it
      // belongs to this user, else fall back to the device cache.
      const current = get().profile;
      if (current?.id === userId) return;
      const cached = await readCachedProfile(userId);
      if (get().session?.user.id === userId) set({ profile: cached });
    })().finally(() => inflight.delete(userId));

    inflight.set(userId, task);
    return task;
  };

  return {
  session: null,
  profile: null,
  initializing: true,
  signingIn: false,
  error: null,

  init: () => {
    (async () => {
      try {
        // getSession() already retries a failed token refresh for ~30s, and a
        // network failure does NOT delete the saved login: auth-js refreshes it
        // once the connection is back and onAuthStateChange signs the worker
        // straight back in. So no extra retry here — only a ceiling, because a
        // hung request on a dead connection has no timeout of its own.
        const result = await Promise.race([
          supabase.auth.getSession(),
          wait(STARTUP_TIMEOUT_MS).then(() => null),
        ]);
        const session = result?.data.session ?? null;
        if (!session) {
          set({ session: null, profile: null });
          return;
        }

        const userId = session.user.id;
        const cached = await readCachedProfile(userId);
        if (cached) {
          // Show the saved profile immediately; refresh it in the background.
          set({ session, profile: cached, initializing: false });
          void syncProfile(userId);
          return;
        }

        // First launch on this device: one quick attempt, then keep trying in
        // the background rather than holding the app on the startup screen.
        const first = await Promise.race([fetchProfile(userId), wait(8000).then(() => null)]);
        if (first) await writeCachedProfile(first);
        set({ session, profile: first });
        if (!first) void syncProfile(userId);
      } catch (e) {
        console.warn('[auth] init', e);
      } finally {
        // The startup screen covers the app while this is true — it must ALWAYS
        // clear, whatever happened above.
        set({ initializing: false });
      }
    })();

    supabase.auth.onAuthStateChange((event, session) => {
      // No session (signed out / expired) → clear everything.
      if (!session) {
        if (event === 'SIGNED_OUT') void clearCachedProfile();
        set({ session: null, profile: null });
        return;
      }

      const userId = session.user.id;
      // A different account signed in: don't show the previous worker's profile.
      if (get().profile && get().profile?.id !== userId) set({ session, profile: null });
      else set({ session });

      void syncProfile(userId);
      registerPush(userId);
    });
  },

  signIn: async (email, password) => {
    set({ signingIn: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      set({ signingIn: false, error: error.message });
      return false;
    }
    set({ signingIn: false });
    return true;
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore network/expired-session errors — we still clear the local session below
    } finally {
      await clearCachedProfile();
      set({ session: null, profile: null });
    }
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session) return;
    // Callers (e.g. Settings after changing the photo) need data from AFTER
    // their write, so let any sync that started earlier finish, then fetch again.
    const userId = session.user.id;
    await inflight.get(userId);
    // Same guarded path as startup: only replaces on success, never wipes.
    await syncProfile(userId);
  },
  };
});
