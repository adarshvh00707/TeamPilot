import { router } from 'expo-router';
import { View } from 'react-native';
import type { Task } from '@teampilot/shared';
import { AppText, Badge, Card } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatDateTime, humanize, statusTone } from './format';

export function TaskRow({ task }: { task: Task }) {
  const { spacing } = useTheme();
  const pending = task.staffing.assigned - task.staffing.staffed;
  return (
    <Card onPress={() => router.push(`/tasks/${task.id}`)} accessibilityLabel={`Open ${task.title}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="heading" style={{ flex: 1 }}>
          {task.title}
        </AppText>
        <Badge label={humanize(task.status)} tone={statusTone(task.status)} />
      </View>
      <AppText tone="muted">
        Staffed {task.staffing.staffed}/{task.requiredHeadcount}
        {pending > 0 ? ` · ${pending} pending` : ''}
        {task.locationName ? ` · ${task.locationName}` : ''}
      </AppText>
      {task.completionDeadline ? <AppText tone="muted">Due {formatDateTime(task.completionDeadline)}</AppText> : null}
    </Card>
  );
}
