import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { MANUAL_TASK_TARGETS, taskStateMachine, type TaskDetail, type TaskStatus } from '@teampilot/shared';
import { AppText, Badge, Button, Card, Chip, ErrorState, Input, ListSkeleton, Screen } from '@/components/ui';
import { useMembers } from '@/features/org/api';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { AssignmentActions } from '@/features/work/AssignmentActions';
import { useAssign, useAssignmentAction, useTask, useTransitionTask } from '@/features/work/api';
import { formatDateTime, formatRange, humanize, statusTone } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const LIVE = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'] as const;
const ASSIGNABLE: TaskStatus[] = ['SCHEDULED', 'DISPATCHING', 'PARTIALLY_STAFFED', 'FULLY_STAFFED', 'IN_PROGRESS', 'NEEDS_MANAGER_ATTENTION'];

const TRANSITION_LABEL: Record<(typeof MANUAL_TASK_TARGETS)[number], string> = {
  DRAFT: 'Move back to draft',
  SCHEDULED: 'Schedule',
  IN_PROGRESS: 'Mark in progress',
  COMPLETED: 'Mark completed',
  CANCELLED: 'Cancel task',
};

/** Alert.alert buttons are not supported on web; fall back to window.confirm there. */
function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: onConfirm },
  ]);
}

function ManagerControls({ orgId, task }: { orgId: string; task: TaskDetail }) {
  const { spacing } = useTheme();
  const transition = useTransitionTask(orgId, task.id);
  const targets = MANUAL_TASK_TARGETS.filter(
    (t) => t !== task.status && taskStateMachine.can(task.status, t) && !(t === 'DRAFT' && task.staffing.assigned > 0),
  );
  if (!targets.length) return null;
  return (
    <Card>
      <AppText variant="heading">Status</AppText>
      <View style={{ gap: spacing.sm }}>
        {targets.map((t) => (
          <Button
            key={t}
            label={TRANSITION_LABEL[t]}
            variant={t === 'CANCELLED' ? 'danger' : t === 'SCHEDULED' || t === 'COMPLETED' ? 'primary' : 'secondary'}
            loading={transition.isPending && transition.variables?.status === t}
            disabled={transition.isPending}
            onPress={() => {
              const run = () => transition.mutate({ status: t, expectedVersion: task.version });
              if (t === 'CANCELLED') confirm('Cancel this task?', 'All live assignments will be cancelled.', run);
              else run();
            }}
          />
        ))}
      </View>
      {transition.error ? <ErrorState message={errorMessage(transition.error)} /> : null}
    </Card>
  );
}

function AssignPanel({ orgId, task }: { orgId: string; task: TaskDetail }) {
  const { spacing } = useTheme();
  const members = useMembers(orgId);
  const assign = useAssign(orgId, task.id);
  const [userId, setUserId] = useState<string | undefined>();
  const [reason, setReason] = useState('');
  const taken = new Set(task.assignments.filter((a) => (LIVE as readonly string[]).includes(a.status)).map((a) => a.userId));
  const candidates = (members.data?.pages.flatMap((p) => p.data) ?? []).filter((m) => m.status === 'ACTIVE' && !taken.has(m.userId));
  const atCapacity = task.staffing.assigned >= task.requiredHeadcount;

  return (
    <Card>
      <AppText variant="heading">Assign someone</AppText>
      {members.isPending ? <ListSkeleton rows={1} /> : null}
      {!members.isPending && !candidates.length ? <AppText tone="muted">Everyone is already assigned.</AppText> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {candidates.map((m) => (
          <Chip
            key={m.userId}
            label={m.displayName ?? 'Unnamed member'}
            selected={userId === m.userId}
            onPress={() => setUserId(userId === m.userId ? undefined : m.userId)}
          />
        ))}
      </View>
      {atCapacity ? (
        <Input
          label="Override reason"
          hint={`Already ${task.staffing.assigned}/${task.requiredHeadcount} assigned. The reason is recorded in the audit log.`}
          value={reason}
          onChangeText={setReason}
          placeholder="Why does this task need another person?"
        />
      ) : null}
      {assign.error ? <ErrorState message={errorMessage(assign.error)} /> : null}
      <Button
        label="Assign"
        disabled={!userId || (atCapacity && reason.trim().length < 3)}
        loading={assign.isPending}
        onPress={() =>
          assign.mutate(
            { userId: userId!, ...(atCapacity ? { overrideReason: reason.trim() } : {}) },
            { onSuccess: () => { setUserId(undefined); setReason(''); } },
          )
        }
      />
    </Card>
  );
}

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orgId = useActiveOrgId();
  const { isManager, me } = useOrg();
  const { spacing } = useTheme();
  const task = useTask(orgId, id);
  const cancelAssignment = useAssignmentAction(orgId);

  if (task.isPending) return <Screen><ListSkeleton /></Screen>;
  if (task.error) return <Screen><ErrorState message={errorMessage(task.error)} onRetry={() => void task.refetch()} /></Screen>;
  const t = task.data;
  const mine = t.assignments.find((a) => a.userId === me?.profile.id && (LIVE as readonly string[]).includes(a.status));

  return (
    <Screen refreshing={task.isRefetching} onRefresh={() => void task.refetch()}>
      <Stack.Screen options={{ title: t.title }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText variant="title" style={{ flex: 1 }}>
            {t.title}
          </AppText>
          <Badge label={humanize(t.status)} tone={statusTone(t.status)} />
        </View>
        <AppText tone="muted">
          Staffed {t.staffing.staffed}/{t.requiredHeadcount}
          {t.minimumRequiredHeadcount ? ` (minimum ${t.minimumRequiredHeadcount})` : ''}
        </AppText>
        {t.event ? (
          <AppText tone="primary" onPress={() => router.push(`/events/${t.event!.id}`)}>
            {t.event.title} · {formatRange(t.event.startAt, t.event.endAt)}
          </AppText>
        ) : null}
        {t.locationName ? <AppText tone="muted">Location: {t.locationName}</AppText> : null}
        {t.completionDeadline ? <AppText tone="muted">Due {formatDateTime(t.completionDeadline)}</AppText> : null}
        {t.estimatedDurationMinutes ? <AppText tone="muted">About {t.estimatedDurationMinutes} min</AppText> : null}
        {t.description ? <AppText>{t.description}</AppText> : null}
        {t.instructions ? (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">Instructions</AppText>
            <AppText>{t.instructions}</AppText>
          </View>
        ) : null}
      </Card>

      {mine ? (
        <Card>
          <AppText variant="heading">Your assignment</AppText>
          <Badge label={humanize(mine.status)} tone={statusTone(mine.status)} />
          <AssignmentActions orgId={orgId} assignmentId={mine.id} status={mine.status} />
        </Card>
      ) : null}

      {isManager ? <ManagerControls orgId={orgId} task={t} /> : null}

      <Card>
        <AppText variant="heading">People</AppText>
        {!t.assignments.length ? <AppText tone="muted">Nobody is assigned yet.</AppText> : null}
        {t.assignments.map((a) => (
          <View key={a.id} style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <AppText style={{ flex: 1 }}>{a.displayName ?? 'Unnamed member'}</AppText>
              <Badge label={humanize(a.status)} tone={statusTone(a.status)} />
            </View>
            {a.assignmentSource === 'MANAGER_OVERRIDE' ? (
              <AppText variant="caption" tone="muted">Override: {a.overrideReason}</AppText>
            ) : null}
            {isManager && (LIVE as readonly string[]).includes(a.status) ? (
              <Button
                label="Remove"
                variant="ghost"
                fullWidth={false}
                disabled={cancelAssignment.isPending}
                onPress={() =>
                  confirm('Remove from task?', `${a.displayName ?? 'This person'} will be unassigned.`, () =>
                    cancelAssignment.mutate({ id: a.id, action: 'cancel' }),
                  )
                }
              />
            ) : null}
          </View>
        ))}
        {cancelAssignment.error ? <ErrorState message={errorMessage(cancelAssignment.error)} /> : null}
      </Card>

      {isManager && ASSIGNABLE.includes(t.status) ? <AssignPanel orgId={orgId} task={t} /> : null}
      {isManager && t.status === 'DRAFT' ? (
        <AppText tone="muted">Schedule this task to start assigning people.</AppText>
      ) : null}
    </Screen>
  );
}
