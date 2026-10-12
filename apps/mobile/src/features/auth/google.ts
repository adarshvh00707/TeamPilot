import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { completeAuthFromUrl } from './auth-links';

WebBrowser.maybeCompleteAuthSession();

/**
 * Google sign-in through Supabase OAuth.
 * Web does a full-page redirect (the session is read from the URL on return);
 * native opens an auth browser session that returns to the app's `teampilot://` scheme.
 * Resolves true when a session was established (native), or once the web redirect starts.
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/sign-in` },
    });
    if (error) throw error;
    return true;
  }

  const redirectTo = Linking.createURL('/sign-in');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  return completeAuthFromUrl(result.url);
}
