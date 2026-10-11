import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { AppText, Button, Card, ErrorState, Screen } from '@/components/ui';
import { completeAuthFromUrl } from '@/features/auth/auth-links';
import { supabase } from '@/lib/supabase';

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const url = Linking.useLinkingURL();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // Opening the confirmation link lands here; completing it signs the user in and the auth layout redirects.
  useEffect(() => {
    completeAuthFromUrl(url).catch((e: Error) => setError(e.message));
  }, [url]);

  const resend = async () => {
    if (!email) return;
    setResending(true);
    setError(null);
    const { error: err } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (err) setError(err.message);
    else setStatus('Verification email sent again.');
  };

  return (
    <Screen>
      <Card>
        <AppText variant="heading">Confirm your email</AppText>
        <AppText tone="muted">
          {email ? `We sent a confirmation link to ${email}.` : 'We sent you a confirmation link.'} Open it on this device
          to finish creating your account.
        </AppText>
      </Card>
      {status ? <AppText tone="success">{status}</AppText> : null}
      {error ? <ErrorState message={error} /> : null}
      {email ? <Button label="Resend email" variant="secondary" onPress={resend} loading={resending} /> : null}
    </Screen>
  );
}
