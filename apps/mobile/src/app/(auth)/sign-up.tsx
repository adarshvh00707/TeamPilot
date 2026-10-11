import { useState } from 'react';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, ErrorState, Screen, TextField } from '@/components/ui';
import { authRedirect } from '@/features/auth/auth-links';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.email('Enter a valid email'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/[0-9]/, 'Include a number'),
});
type Form = z.infer<typeof schema>;

export default function SignUp() {
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ displayName, email, password }) => {
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: authRedirect('/verify-email') },
    });
    if (err) {
      setError(err.message);
      return;
    }
    if (!data.session) router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
  });

  return (
    <Screen>
      <TextField control={control} name="displayName" label="Your name" autoComplete="name" textContentType="name" />
      <TextField control={control} name="email" label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <TextField control={control} name="password" label="Password" secureTextEntry autoComplete="new-password" textContentType="newPassword" hint="At least 10 characters with a letter and a number." />
      {error ? <ErrorState message={error} /> : null}
      <Button label="Create account" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}
