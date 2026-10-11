import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, ErrorState, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { pendingInvite } from '@/features/auth/auth-links';
import { useAcceptInvitation } from '@/features/org/api';
import { useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';

export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session } = useAuth();
  const { setActiveOrganization } = useOrg();
  const accept = useAcceptInvitation();

  // Keep the token across sign-in / sign-up so the invitation can be completed afterwards.
  useEffect(() => {
    if (token && !session) void pendingInvite.set(token);
  }, [token, session]);

  if (!token) {
    return (
      <Screen>
        <ErrorState message="This invitation link is incomplete." />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <Card>
          <AppText variant="heading">You have been invited</AppText>
          <AppText tone="muted">Sign in or create an account with the email address the invitation was sent to.</AppText>
        </Card>
        <Button label="Create account" onPress={() => router.push('/sign-up')} />
        <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  const onAccept = () =>
    accept.mutate(token, {
      onSuccess: async (res) => {
        await pendingInvite.clear();
        await setActiveOrganization(res.organizationId);
        router.replace('/home');
      },
    });

  const onDecline = async () => {
    await pendingInvite.clear();
    router.replace('/');
  };

  return (
    <Screen>
      <Card>
        <AppText variant="heading">Join organization</AppText>
        <AppText tone="muted">Accept this invitation to join the organization with the role it was issued for.</AppText>
      </Card>
      {accept.error ? <ErrorState message={errorMessage(accept.error)} /> : null}
      <Button label="Accept invitation" onPress={onAccept} loading={accept.isPending} />
      <Button label="Not now" variant="ghost" onPress={onDecline} />
    </Screen>
  );
}
