import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Badge, Card, Screen } from '@/components/ui';
import { AvailabilityCard } from '@/features/dispatch/AvailabilityCard';
import { OffersCard } from '@/features/dispatch/OffersCard';
import { useOrg } from '@/features/org/OrgProvider';
import { useTheme } from '@/theme';

export default function HomeScreen() {
  const { me, active, isManager, refetch, loading } = useOrg();
  const { spacing } = useTheme();
  const name = me?.profile.displayName ?? me?.email ?? 'there';

  return (
    <Screen refreshing={loading} onRefresh={refetch}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">Hi, {name}</AppText>
        {active ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <AppText tone="muted">{active.organizationName}</AppText>
            <Badge label={active.role} tone="neutral" />
          </View>
        ) : null}
      </View>

      {active ? <OffersCard orgId={active.organizationId} /> : null}
      {active ? <AvailabilityCard orgId={active.organizationId} /> : null}

      <Card onPress={() => router.push('/schedule')} accessibilityLabel="Open my schedule">
        <AppText variant="heading">My schedule</AppText>
        <AppText tone="muted">See and respond to the tasks you are assigned to.</AppText>
      </Card>

      {isManager ? (
        <Card onPress={() => router.push('/operations')} accessibilityLabel="Open manager operations">
          <AppText variant="heading">Manager operations</AppText>
          <AppText tone="muted">Manage events, your team, invitations, and locations.</AppText>
        </Card>
      ) : null}
    </Screen>
  );
}
