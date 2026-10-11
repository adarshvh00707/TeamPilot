import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
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
  { label: 'Needs attention', status: 'NEEDS_MANAGER_ATTENTION', managerOnly: true },
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
  const params = useLocalSearchParams<{ status?: TaskStatus }>();
  const [status, setStatus] = useState<TaskStatus | undefined>(params.status);
  useEffect(() => {
    if (params.status) setStatus(params.status);
  }, [params.status]);
  const tasks = useTasks(orgId, status);
  const rows = tasks.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md, width: '100%', maxWidth: 560, alignSelf: 'center' }}
      data={tasks.isPending || tasks.error ? [] : rows}
      keyExtractor={(t) => t.id}
      refreshing={tasks.isRefetching}
      onRefresh={() => void tasks.refetch()}
      onEndReached={() => tasks.hasNextPage && !tasks.isFetchingNextPage && void tasks.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
          {isManager ? <Button label="New task" onPress={() => router.push('/tasks/new')} /> : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -spacing.gutter }}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
          >
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
