import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import { secureStorage } from './secure-storage';

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    // SecureStore is native-only; on web supabase-js falls back to localStorage (dev preview only).
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web returns from Google OAuth with the session in the URL; native handles redirects itself.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
