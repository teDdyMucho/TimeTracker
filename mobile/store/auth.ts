import { create } from 'zustand';
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

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initializing: true,
  signingIn: false,
  error: null,

  init: () => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      const profile = session ? await fetchProfile(session.user.id) : null;
      set({ session, profile, initializing: false });
    });

    supabase.auth.onAuthStateChange(async (event, session) => {
      // No session (signed out / expired) → clear everything.
      if (!session) {
        set({ session: null, profile: null });
        return;
      }

      // On a token refresh, the session is the same user — DON'T wipe the
      // profile if the refetch fails (e.g. slow network the next morning). That
      // was the "Welcome back, there / T avatar" bug. Keep the existing profile
      // and only replace it when the refetch actually returns one.
      set({ session });
      const fresh = await fetchProfile(session.user.id);
      if (fresh) {
        set({ profile: fresh });
      } else if (event === 'SIGNED_IN') {
        // A real new sign-in with no profile row — nothing to keep.
        set({ profile: null });
      }
      // else (TOKEN_REFRESHED / USER_UPDATED with a failed fetch): keep old profile.

      registerPush(session.user.id);
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
      set({ session: null, profile: null });
    }
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session) return;
    const profile = await fetchProfile(session.user.id);
    // Only replace on success — never wipe a good profile if the fetch failed.
    if (profile) set({ profile });
  },
}));
