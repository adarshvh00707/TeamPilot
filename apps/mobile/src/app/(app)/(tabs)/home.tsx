import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Badge, Card, Screen, UnavailableNotice } from '@/components/ui';
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

      <Card>
        <AppText variant="heading">Availability</AppText>
        <AppText tone="muted">
          Status: <AppText variant="label">Unknown</AppText>. No attendance source is connected yet, so TeamPilot does
          not treat anyone as clocked in.
        </AppText>
      </Card>

      <UnavailableNotice feature="Assignments, task offers, deadlines, and break controls" phase="Phases 2–3" />

      {isManager ? (
        <Card onPress={() => router.push('/operations')} accessibilityLabel="Open manager operations">
          <AppText variant="heading">Manager operations</AppText>
          <AppText tone="muted">Manage your team, invitations, and locations.</AppText>
        </Card>
      ) : null}
    </Screen>
  );
}
