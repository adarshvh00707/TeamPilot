import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, Card, ErrorState, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUpdateProfile } from '@/features/org/api';
import { useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';

const schema = z.object({ displayName: z.string().trim().min(1, 'Enter your name').max(80) });

export default function ProfileScreen() {
  const { me, active, memberships } = useOrg();
  const { signOut } = useAuth();
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const { control, handleSubmit, reset } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: me?.profile.displayName ?? '' },
  });

  useEffect(() => {
    reset({ displayName: me?.profile.displayName ?? '' });
  }, [me?.profile.displayName, reset]);

  const onSave = handleSubmit((values) => {
    setSaved(false);
    update.mutate(values, { onSuccess: () => setSaved(true) });
  });

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will stop receiving updates on this device until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen>
      <Card>
        <AppText variant="label" tone="muted">Signed in as</AppText>
        <AppText>{me?.email ?? 'Unknown email'}</AppText>
      </Card>

      <TextField control={control} name="displayName" label="Display name" autoComplete="name" />
      {update.error ? <ErrorState message={errorMessage(update.error)} /> : null}
      {saved ? <AppText tone="success">Profile saved.</AppText> : null}
      <Button label="Save profile" onPress={onSave} loading={update.isPending} />

      <Card onPress={() => router.push('/organizations')} accessibilityLabel="Switch organization">
        <AppText variant="label" tone="muted">Organization</AppText>
        <AppText variant="heading">{active?.organizationName ?? 'None'}</AppText>
        <AppText tone="muted">
          {memberships.length > 1 ? `Member of ${memberships.length} organizations. Tap to switch.` : 'Tap to create or switch organizations.'}
        </AppText>
      </Card>

      <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
    </Screen>
  );
}
