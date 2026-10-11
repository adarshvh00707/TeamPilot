import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';

const PENDING_INVITE_KEY = 'teampilot.pendingInviteToken';

export const authRedirect = (path: '/verify-email' | '/reset-password') => Linking.createURL(path);

/**
 * Completes a Supabase email link (signup confirmation or password recovery) opened in the app.
 * Supports both PKCE (?code=) and implicit (#access_token=&refresh_token=) link formats.
 * Returns true when a session was established.
 */
export async function completeAuthFromUrl(url: string | null): Promise<boolean> {
  if (!url) return false;
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const errorDescription = fragment.get('error_description') ?? parsed.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return true;
  }
  return false;
}

export const pendingInvite = {
  get: () => SecureStore.getItemAsync(PENDING_INVITE_KEY),
  set: (token: string) => SecureStore.setItemAsync(PENDING_INVITE_KEY, token),
  clear: () => SecureStore.deleteItemAsync(PENDING_INVITE_KEY),
};
