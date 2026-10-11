import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, Card, ErrorState, Screen, TextField } from '@/components/ui';
import { authRedirect } from '@/features/auth/auth-links';
import { supabase } from '@/lib/supabase';

const schema = z.object({ email: z.email('Enter a valid email') });

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.email ?? '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirect('/reset-password'),
    });
    if (err) setError(err.message);
    else setSent(true);
  });

  if (sent) {
    return (
      <Screen>
        <Card>
          <AppText variant="heading">Check your email</AppText>
          <AppText tone="muted">
            If an account exists for that address, we sent a link to reset your password. Open it on this device.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText tone="muted">Enter your account email and we will send you a reset link.</AppText>
      <TextField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {error ? <ErrorState message={error} /> : null}
      <Button label="Send reset link" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}
