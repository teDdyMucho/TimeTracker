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

    supabase.auth.onAuthStateChange(async (_event, session) => {
      const profile = session ? await fetchProfile(session.user.id) : null;
      set({ session, profile });
      if (session) registerPush(session.user.id);
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
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
