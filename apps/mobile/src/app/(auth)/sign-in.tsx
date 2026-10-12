import { useState } from 'react';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, ErrorState, Screen, TextField } from '@/components/ui';
import { signInWithGoogle } from '@/features/auth/google';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { control, handleSubmit, formState, getValues } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!err) return; // Auth layout redirects once the session arrives.
    if (err.code === 'email_not_confirmed') {
      router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      return;
    }
    setError(err.code === 'invalid_credentials' ? 'Incorrect email or password.' : err.message);
  });

  return (
    <Screen>
      <TextField control={control} name="email" label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <TextField control={control} name="password" label="Password" secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={onSubmit} />
      {error ? <ErrorState message={error} /> : null}
      <Button label="Sign in" onPress={onSubmit} loading={formState.isSubmitting} />
      <Button
        label="Forgot password?"
        variant="ghost"
        onPress={() => router.push({ pathname: '/forgot-password', params: { email: getValues('email') } })}
      />
      <AppText tone="muted" variant="caption" style={{ textAlign: 'center' }}>or</AppText>
      <Button
        label="Continue with Google"
        variant="secondary"
        loading={googleLoading}
        onPress={async () => {
          setError(null);
          setGoogleLoading(true);
          try {
            await signInWithGoogle();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Google sign-in failed.');
          } finally {
            setGoogleLoading(false);
          }
        }}
      />
    </Screen>
  );
}
