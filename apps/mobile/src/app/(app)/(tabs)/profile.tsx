import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ChevronRight, LogOut } from 'lucide-react-native';
import { AppText, Badge, Button, Card, ErrorState, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUpdateProfile } from '@/features/org/api';
import { useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const schema = z.object({ displayName: z.string().trim().min(1, 'Enter your name').max(80) });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export default function ProfileScreen() {
  const { me, active, memberships } = useOrg();
  const { signOut } = useAuth();
  const { colors, spacing } = useTheme();
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

  const confirmSignOut = () => {
    const message = 'You will stop receiving updates on this device until you sign in again.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Sign out?\n\n${message}`)) void signOut();
      return;
    }
    Alert.alert('Sign out?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const name = me?.profile.displayName ?? me?.email ?? '';

  return (
    <Screen>
      <Card tone="ink" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="heading" style={{ color: colors.ink }}>{initials(name)}</AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" style={{ color: colors.inkText }} numberOfLines={1}>{me?.profile.displayName ?? 'No name yet'}</AppText>
          <AppText variant="caption" style={{ color: '#A1A1AA' }} numberOfLines={1}>{me?.email ?? 'Unknown email'}</AppText>
        </View>
        {active ? <Badge label={active.role} tone="neutral" /> : null}
      </Card>

      <View style={{ gap: spacing.md }}>
        <TextField control={control} name="displayName" label="Display name" autoComplete="name" />
        {update.error ? <ErrorState message={errorMessage(update.error)} /> : null}
        {saved ? <AppText tone="success">Profile saved.</AppText> : null}
        <Button label="Save profile" onPress={onSave} loading={update.isPending} />
      </View>

      <Card onPress={() => router.push('/organizations')} accessibilityLabel="Switch organization">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={20} color={colors.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" numberOfLines={1}>{active?.organizationName ?? 'No organization'}</AppText>
            <AppText variant="caption" tone="muted">
              {memberships.length > 1 ? `Member of ${memberships.length} organizations · Switch` : 'Create or switch organizations'}
            </AppText>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
      </Card>

      <Card onPress={confirmSignOut} accessibilityLabel="Sign out">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.dangerSurface, alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={20} color={colors.danger} />
          </View>
          <AppText variant="label" style={{ color: colors.danger, flex: 1 }}>Sign out</AppText>
        </View>
      </Card>
    </Screen>
  );
}
