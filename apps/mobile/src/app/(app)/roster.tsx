import { View } from 'react-native';
import { Stack } from 'expo-router';
import { AppText, Badge, Card, EmptyState, ErrorState, ListSkeleton, Screen } from '@/components/ui';
import { availabilityTone, verificationLabel } from '@/features/dispatch/AvailabilityCard';
import { useRoster } from '@/features/dispatch/api';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { formatTime, humanize } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

export default function RosterScreen() {
  const orgId = useActiveOrgId();
  const { isManager } = useOrg();
  const { spacing } = useTheme();
  const roster = useRoster(orgId);

  if (!isManager) return <Screen><ErrorState message="Manager access is required for the roster." /></Screen>;

  return (
    <Screen refreshing={roster.isRefetching} onRefresh={() => void roster.refetch()}>
      <Stack.Screen options={{ title: 'Live roster' }} />
      {roster.isPending ? <ListSkeleton /> : null}
      {roster.error ? <ErrorState message={errorMessage(roster.error)} onRetry={() => void roster.refetch()} /> : null}
      {roster.data && !roster.data.length ? <EmptyState title="No members yet" /> : null}
      {roster.data?.map((m) => (
        <Card key={m.userId}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="label" style={{ flex: 1 }}>{m.displayName ?? 'Unnamed member'}</AppText>
            <Badge label={humanize(m.status)} tone={availabilityTone(m.status)} />
          </View>
          <AppText variant="caption" tone="muted">
            {humanize(m.role)}
            {m.clockedInAt ? ` · in since ${formatTime(m.clockedInAt)} · ${verificationLabel(m.verification)}` : ' · not clocked in'}
            {m.paused ? ' · offers paused' : ''}
            {m.activeBreak ? ` · break until ${formatTime(m.activeBreak.expectedEndAt)}` : ''}
            {` · ${m.activeAssignments} active task${m.activeAssignments === 1 ? '' : 's'}`}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}
