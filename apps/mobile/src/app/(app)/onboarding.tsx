import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOrganizationSchema, type CreateOrganizationInput } from '@teampilot/shared';
import { AppText, Button, Card, ErrorState, Screen, TextField } from '@/components/ui';
import { useCreateOrganization } from '@/features/org/api';
import { useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';

const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export default function Onboarding() {
  const create = useCreateOrganization();
  const { setActiveOrganization, memberships } = useOrg();
  const { control, handleSubmit } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', timezone: deviceTimeZone() },
  });

  const onSubmit = handleSubmit((input) =>
    create.mutate(input, {
      onSuccess: async (org) => {
        await setActiveOrganization(org.id);
        router.replace('/home');
      },
    }),
  );

  return (
    <Screen>
      {memberships.length === 0 ? (
        <Card>
          <AppText variant="heading">Welcome to TeamPilot</AppText>
          <AppText tone="muted">
            Create an organization to get started. If your manager invited you, open the invitation link from your email
            instead.
          </AppText>
        </Card>
      ) : null}
      <TextField control={control} name="name" label="Organization name" placeholder="e.g. Downtown Venue Ops" />
      <TextField
        control={control}
        name="timezone"
        label="Timezone"
        autoCapitalize="none"
        autoCorrect={false}
        hint="IANA timezone, e.g. America/New_York. Event times are shown in this zone."
      />
      {create.error ? <ErrorState message={errorMessage(create.error)} /> : null}
      <Button label="Create organization" onPress={onSubmit} loading={create.isPending} />
    </Screen>
  );
}
