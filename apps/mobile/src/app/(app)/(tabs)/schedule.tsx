import { router } from 'expo-router';
import { SectionList, View } from 'react-native';
import type { ScheduleItem } from '@teampilot/shared';
import { AppText, Badge, Card, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useActiveOrgId } from '@/features/org/OrgProvider';
import { AssignmentActions } from '@/features/work/AssignmentActions';
import { useSchedule } from '@/features/work/api';
import { formatDay, formatRange, formatTime, humanize, statusTone } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

function groupByDay(items: ScheduleItem[]) {
  const sections: Array<{ title: string; data: ScheduleItem[] }> = [];
  for (const item of items) {
    const title = formatDay(item.sortAt);
    const last = sections[sections.length - 1];
    if (last?.title === title) last.data.push(item);
    else sections.push({ title, data: [item] });
  }
  return sections;
}

function whenLabel(item: ScheduleItem) {
  if (item.event) return formatRange(item.event.startAt, item.event.endAt);
  if (item.task.dispatchStartAt) return `Starts ${formatTime(item.task.dispatchStartAt)}`;
  if (item.task.completionDeadline) return `Due ${formatTime(item.task.completionDeadline)}`;
  return 'No set time';
}

export default function ScheduleScreen() {
  const orgId = useActiveOrgId();
  const { colors, spacing } = useTheme();
  const schedule = useSchedule(orgId);

  if (schedule.isPending) return <View style={{ padding: spacing.lg }}><ListSkeleton /></View>;
  if (schedule.error) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorState message={errorMessage(schedule.error)} onRetry={() => void schedule.refetch()} />
      </View>
    );
  }

  return (
    <SectionList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      sections={groupByDay(schedule.data)}
      keyExtractor={(i) => i.assignment.id}
      refreshing={schedule.isRefetching}
      onRefresh={() => void schedule.refetch()}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <AppText variant="label" tone="muted" style={{ marginTop: spacing.md }}>
          {section.title}
        </AppText>
      )}
      ListEmptyComponent={
        <EmptyState title="Nothing scheduled" message="Tasks you are assigned to will show up here, grouped by day." />
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/tasks/${item.task.id}`)} accessibilityLabel={`Open ${item.task.title}`}>
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <AppText variant="heading" style={{ flex: 1 }}>
                {item.task.title}
              </AppText>
              <Badge label={humanize(item.assignment.status)} tone={statusTone(item.assignment.status)} />
            </View>
            <AppText tone="muted">{whenLabel(item)}</AppText>
            {item.event || item.task.locationName ? (
              <AppText tone="muted">{[item.event?.title, item.task.locationName].filter(Boolean).join(' · ')}</AppText>
            ) : null}
          </View>
          <AssignmentActions orgId={orgId} assignmentId={item.assignment.id} status={item.assignment.status} />
        </Card>
      )}
    />
  );
}
