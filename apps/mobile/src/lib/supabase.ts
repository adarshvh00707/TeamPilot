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
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
