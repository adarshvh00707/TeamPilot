import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { useEvents } from '@/features/work/api';
import { formatRange, humanize, statusTone } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

export default function EventsScreen() {
  const orgId = useActiveOrgId();
  const { isManager } = useOrg();
  const { colors, spacing } = useTheme();
  const events = useEvents(orgId);
  const rows = events.data?.pages.flatMap((p) => p.data) ?? [];

  if (events.isPending) return <View style={{ padding: spacing.lg }}><ListSkeleton /></View>;
  if (events.error) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorState message={errorMessage(events.error)} onRetry={() => void events.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={rows}
      keyExtractor={(e) => e.id}
      refreshing={events.isRefetching}
      onRefresh={() => void events.refetch()}
      onEndReached={() => events.hasNextPage && !events.isFetchingNextPage && void events.fetchNextPage()}
      ListHeaderComponent={
        isManager ? (
          <View style={{ marginBottom: spacing.sm }}>
            <Button label="New event" onPress={() => router.push('/events/new')} />
          </View>
        ) : null
      }
      ListEmptyComponent={<EmptyState title="No upcoming events" message="Events group the tasks needed for a gala, conference, or shift." />}
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/events/${item.id}`)} accessibilityLabel={`Open ${item.title}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="heading" style={{ flex: 1 }}>
              {item.title}
            </AppText>
            <Badge label={humanize(item.status)} tone={statusTone(item.status)} />
          </View>
          <AppText tone="muted">{formatRange(item.startAt, item.endAt, item.timezone)}</AppText>
          <AppText tone="muted">
            {item.taskCount} {item.taskCount === 1 ? 'task' : 'tasks'}
            {item.locationName ? ` · ${item.locationName}` : ''}
          </AppText>
        </Card>
      )}
    />
  );
}
