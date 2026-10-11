import { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ROLES, ROLE_RANK, createInvitationSchema, type CreatedInvitation, type Role } from '@teampilot/shared';
import { z } from 'zod';
import { AppText, Button, Card, ErrorState, Screen, TextField } from '@/components/ui';
import { useCreateInvitation } from '@/features/org/api';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

type FormInput = z.input<typeof createInvitationSchema>;

export default function InviteMember() {
  const orgId = useActiveOrgId();
  const { role } = useOrg();
  const { spacing } = useTheme();
  const create = useCreateInvitation(orgId);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const { control, handleSubmit } = useForm<FormInput, unknown, z.output<typeof createInvitationSchema>>({
    resolver: zodResolver(createInvitationSchema),
    defaultValues: { email: '', role: 'STAFF' },
  });
  const grantable = ROLES.filter((r) => role === 'OWNER' || (role && ROLE_RANK[r] <= ROLE_RANK[role]));

  const onSubmit = handleSubmit((input) => create.mutate(input, { onSuccess: setCreated }));

  if (created) {
    const link = Linking.createURL('/accept-invite', { queryParams: { token: created.token } });
    return (
      <Screen>
        <Card>
          <AppText variant="heading">Invitation created</AppText>
          <AppText tone="muted">
            Send this link to {created.email}. It works once and expires {new Date(created.expiresAt).toLocaleString()}.
            Automatic invitation emails are not enabled yet, and the link cannot be shown again.
          </AppText>
        </Card>
        <Button label="Share invitation link" onPress={() => void Share.share({ message: `Join our team on TeamPilot AI: ${link}` })} />
        <Button label="Done" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TextField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Controller
        control={control}
        name="role"
        render={({ field: { value, onChange } }) => (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label">Role</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
              {grantable.map((r: Role) => (
                <Button
                  key={r}
                  label={r}
                  fullWidth={false}
                  variant={value === r ? 'primary' : 'secondary'}
                  accessibilityState={{ selected: value === r }}
                  onPress={() => onChange(r)}
                />
              ))}
            </View>
          </View>
        )}
      />
      {create.error ? <ErrorState message={errorMessage(create.error)} /> : null}
      <Button label="Create invitation" onPress={onSubmit} loading={create.isPending} />
    </Screen>
  );
}
