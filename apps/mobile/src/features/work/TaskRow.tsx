import { router } from 'expo-router';
import { View } from 'react-native';
import type { Task } from '@teampilot/shared';
import { AppText, Badge, Card } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatDateTime, humanize, statusTone } from './format';

export function TaskRow({ task }: { task: Task }) {
  const { colors, spacing, scale } = useTheme();
  const pending = task.staffing.assigned - task.staffing.staffed;
  const required = Math.max(1, task.requiredHeadcount);
  const ratio = Math.min(1, task.staffing.staffed / required);
  return (
    <Card onPress={() => router.push(`/tasks/${task.id}`)} accessibilityLabel={`Open ${task.title}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
        <AppText variant="heading" style={{ flex: 1 }} numberOfLines={2}>
          {task.title}
        </AppText>
        <Badge label={humanize(task.status)} tone={statusTone(task.status)} />
      </View>
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {[pending > 0 ? `${pending} pending` : null, task.locationName, task.completionDeadline ? `Due ${formatDateTime(task.completionDeadline)}` : null]
              .filter(Boolean)
              .join(' · ') || 'Staffed'}
          </AppText>
          <AppText variant="label">
            {task.staffing.staffed}/{task.requiredHeadcount}
          </AppText>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
          <View style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3, backgroundColor: ratio >= 1 ? scale.high : ratio > 0 ? scale.mid : scale.low }} />
        </View>
      </View>
    </Card>
  );
}
