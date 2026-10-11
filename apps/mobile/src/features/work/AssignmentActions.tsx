import { View } from 'react-native';
import type { AssignmentStatus } from '@teampilot/shared';
import { Button, ErrorState } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { useAssignmentAction, type AssignmentAction } from './api';

const ACTIONS: Partial<Record<AssignmentStatus, Array<{ action: AssignmentAction; label: string; variant: 'primary' | 'secondary' }>>> = {
  ASSIGNED: [
    { action: 'accept', label: 'Accept', variant: 'primary' },
    { action: 'decline', label: 'Decline', variant: 'secondary' },
  ],
  ACCEPTED: [{ action: 'start', label: 'Start work', variant: 'primary' }],
  IN_PROGRESS: [{ action: 'complete', label: 'Mark complete', variant: 'primary' }],
};

/** Buttons for the signed-in user's own assignment. */
export function AssignmentActions({ orgId, assignmentId, status }: { orgId: string; assignmentId: string; status: AssignmentStatus }) {
  const { spacing } = useTheme();
  const mutation = useAssignmentAction(orgId);
  const actions = ACTIONS[status];
  if (!actions) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {actions.map((a) => (
          <View key={a.action} style={{ flex: 1 }}>
            <Button
              label={a.label}
              variant={a.variant}
              loading={mutation.isPending && mutation.variables?.action === a.action}
              disabled={mutation.isPending}
              onPress={() => mutation.mutate({ id: assignmentId, action: a.action })}
            />
          </View>
        ))}
      </View>
      {mutation.error ? <ErrorState message={errorMessage(mutation.error)} /> : null}
    </View>
  );
}
