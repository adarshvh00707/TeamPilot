import { Alert, Platform, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { EVENT_TRANSITIONS, type EventStatus } from '@teampilot/shared';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, Screen } from '@/components/ui';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { TaskRow } from '@/features/work/TaskRow';
import { useEvent, useTransitionEvent } from '@/features/work/api';
import { formatRange, humanize, statusTone } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const LABEL: Record<EventStatus, string> = {
  DRAFT: 'Unpublish (back to draft)',
  PUBLISHED: 'Publish',
  IN_PROGRESS: 'Start event',
  COMPLETED: 'Mark completed',
  CANCELLED: 'Cancel event',
};

function confirmCancel(onConfirm: () => void) {
  const message = 'All open tasks for this event and their assignments will be cancelled.';
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`Cancel this event?\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert('Cancel this event?', message, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Cancel event', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orgId = useActiveOrgId();
  const { isManager } = useOrg();
  const { spacing } = useTheme();
  const event = useEvent(orgId, id);
  const transition = useTransitionEvent(orgId, id);

  if (event.isPending) return <Screen><ListSkeleton /></Screen>;
  if (event.error) return <Screen><ErrorState message={errorMessage(event.error)} onRetry={() => void event.refetch()} /></Screen>;
  const e = event.data;
  const open = e.status !== 'COMPLETED' && e.status !== 'CANCELLED';

  return (
    <Screen refreshing={event.isRefetching} onRefresh={() => void event.refetch()}>
      <Stack.Screen options={{ title: e.title }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText variant="title" style={{ flex: 1 }}>
            {e.title}
          </AppText>
          <Badge label={humanize(e.status)} tone={statusTone(e.status)} />
        </View>
        <AppText tone="muted">{formatRange(e.startAt, e.endAt, e.timezone)} ({e.timezone})</AppText>
        {e.locationName ? <AppText tone="muted">Location: {e.locationName}</AppText> : null}
        {e.description ? <AppText>{e.description}</AppText> : null}
        {e.status === 'DRAFT' ? <AppText tone="muted">Staff cannot see this event until it is published.</AppText> : null}
      </Card>

      {isManager && EVENT_TRANSITIONS[e.status].length ? (
        <Card>
          <AppText variant="heading">Status</AppText>
          {EVENT_TRANSITIONS[e.status].map((s) => (
            <Button
              key={s}
              label={LABEL[s]}
              variant={s === 'CANCELLED' ? 'danger' : s === 'PUBLISHED' || s === 'COMPLETED' ? 'primary' : 'secondary'}
              loading={transition.isPending && transition.variables === s}
              disabled={transition.isPending}
              onPress={() => (s === 'CANCELLED' ? confirmCancel(() => transition.mutate(s)) : transition.mutate(s))}
            />
          ))}
          {transition.error ? <ErrorState message={errorMessage(transition.error)} /> : null}
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="heading">Tasks</AppText>
        {isManager && open ? (
          <Button label="Add task" variant="secondary" onPress={() => router.push({ pathname: '/tasks/new', params: { eventId: e.id } })} />
        ) : null}
        {e.tasks.length ? e.tasks.map((t) => <TaskRow key={t.id} task={t} />) : <EmptyState title="No tasks yet" />}
      </View>
    </Screen>
  );
}
