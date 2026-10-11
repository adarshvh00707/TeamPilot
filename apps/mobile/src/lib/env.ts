// EXPO_PUBLIC_* values are inlined into the bundle at build time; they must never hold secrets.
// The Supabase publishable key is designed to be public; RLS protects the data.
const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
};

export const missingEnv = Object.entries(raw)
  .filter(([, v]) => !v)
  .map(([k]) => k);

export const env = {
  supabaseUrl: raw.supabaseUrl ?? 'http://127.0.0.1:54321',
  supabasePublishableKey: raw.supabasePublishableKey ?? 'missing',
  apiUrl: (raw.apiUrl ?? 'http://127.0.0.1:4000').replace(/\/$/, ''),
};
