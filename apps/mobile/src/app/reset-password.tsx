import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, ErrorState, ListSkeleton, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeAuthFromUrl } from '@/features/auth/auth-links';
import { supabase } from '@/lib/supabase';

const schema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function ResetPassword() {
  const url = Linking.useLinkingURL();
  const { session } = useAuth();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  useEffect(() => {
    completeAuthFromUrl(url)
      .catch((e: Error) => setLinkError(e.message))
      .finally(() => setChecking(false));
  }, [url]);

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message);
    else router.replace('/');
  });

  if (checking) return <Screen><ListSkeleton rows={2} /></Screen>;
  if (!session) {
    return (
      <Screen>
        <ErrorState message={linkError ?? 'This reset link is invalid or has expired. Request a new one.'} />
        <Button label="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText tone="muted">Choose a new password for your account.</AppText>
      <TextField control={control} name="password" label="New password" secureTextEntry autoComplete="new-password" />
      <TextField control={control} name="confirm" label="Confirm password" secureTextEntry autoComplete="new-password" />
      {error ? <ErrorState message={error} /> : null}
      <Button label="Update password" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}
