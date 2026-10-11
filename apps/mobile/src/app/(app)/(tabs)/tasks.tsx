import { useState } from 'react';
import { router } from 'expo-router';
import { FlatList, ScrollView, View } from 'react-native';
import type { TaskStatus } from '@teampilot/shared';
import { Button, Chip, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { TaskRow } from '@/features/work/TaskRow';
import { useTasks } from '@/features/work/api';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const FILTERS: Array<{ label: string; status?: TaskStatus; managerOnly?: boolean }> = [
  { label: 'All' },
  { label: 'Draft', status: 'DRAFT', managerOnly: true },
  { label: 'Scheduled', status: 'SCHEDULED' },
  { label: 'Partly staffed', status: 'PARTIALLY_STAFFED' },
  { label: 'Fully staffed', status: 'FULLY_STAFFED' },
  { label: 'In progress', status: 'IN_PROGRESS' },
  { label: 'Completed', status: 'COMPLETED' },
  { label: 'Cancelled', status: 'CANCELLED' },
];

export default function TasksScreen() {
  const orgId = useActiveOrgId();
  const { isManager } = useOrg();
  const { colors, spacing } = useTheme();
  const [status, setStatus] = useState<TaskStatus | undefined>();
  const tasks = useTasks(orgId, status);
  const rows = tasks.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={tasks.isPending || tasks.error ? [] : rows}
      keyExtractor={(t) => t.id}
      refreshing={tasks.isRefetching}
      onRefresh={() => void tasks.refetch()}
      onEndReached={() => tasks.hasNextPage && !tasks.isFetchingNextPage && void tasks.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
          {isManager ? <Button label="New task" onPress={() => router.push('/tasks/new')} /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {FILTERS.filter((f) => isManager || !f.managerOnly).map((f) => (
              <Chip key={f.label} label={f.label} selected={status === f.status} onPress={() => setStatus(f.status)} />
            ))}
          </ScrollView>
          {tasks.isPending ? <ListSkeleton /> : null}
          {tasks.error ? <ErrorState message={errorMessage(tasks.error)} onRetry={() => void tasks.refetch()} /> : null}
        </View>
      }
      ListEmptyComponent={
        tasks.isPending || tasks.error ? null : (
          <EmptyState
            title="No tasks"
            message={isManager ? 'Create a task, schedule it, then assign people.' : 'Published tasks for your organization appear here.'}
          />
        )
      }
      renderItem={({ item }) => <TaskRow task={item} />}
    />
  );
}
