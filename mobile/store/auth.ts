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

/**
 * On a cold start with an expired token, getSession() refreshes it first. If
 * that refresh fails on a network error it reports "no session" even though the
 * saved login is still valid — which looked like a random sign-out. Only treat
 * it as signed out when there is no error; otherwise retry.
 */
async function getSessionWithRetry(attempts = 3): Promise<Session | null> {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (data.session || !error) return data.session;
    if (i < attempts - 1) await wait(1500 * (i + 1));
  }
  return null;
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initializing: true,
  signingIn: false,
  error: null,

  init: () => {
    (async () => {
      const session = await getSessionWithRetry();
      if (!session) {
        set({ session: null, profile: null, initializing: false });
        return;
      }

      // Show the cached profile immediately, then refresh it in the background.
      const cached = await readCachedProfile(session.user.id);
      if (cached) set({ session, profile: cached, initializing: false });

      const fresh = await fetchProfileWithRetry(session.user.id);
      if (fresh) await writeCachedProfile(fresh);
      set({ session, profile: fresh ?? cached, initializing: false });
    })();

    supabase.auth.onAuthStateChange(async (event, session) => {
      // No session (signed out / expired) → clear everything.
      if (!session) {
        if (event === 'SIGNED_OUT') await clearCachedProfile();
        set({ session: null, profile: null });
        return;
      }

      set({ session });
      const userId = session.user.id;
      const fresh = await fetchProfileWithRetry(userId);
      if (fresh) {
        set({ profile: fresh });
        await writeCachedProfile(fresh);
      } else {
        // Fetch failed — never wipe a good profile. Keep the one in memory if it
        // belongs to this user, else fall back to the device cache.
        const current = get().profile;
        const keep = current?.id === userId ? current : await readCachedProfile(userId);
        set({ profile: keep });
      }

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
    const profile = await fetchProfileWithRetry(session.user.id);
    // Only replace on success — never wipe a good profile if the fetch failed.
    if (profile) {
      set({ profile });
      await writeCachedProfile(profile);
    }
  },
}));
