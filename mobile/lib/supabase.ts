import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced early in dev so a missing .env doesn't fail silently.
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are not set — see .env.example');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// React Native does not run timers reliably while backgrounded, so Supabase's
// token auto-refresh stalls overnight and the session appears to "reset" (the
// user is logged out / shown the default state next morning). The official fix:
// pause auto-refresh in the background and resume it (which refreshes the token)
// whenever the app returns to the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
