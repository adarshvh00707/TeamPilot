import { router } from 'expo-router';
import { ClipboardCheck, PlayCircle, Timer } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { ScheduleItem } from '@teampilot/shared';
import { AppText, ListSkeleton } from '@/components/ui';
import { useTheme } from '@/theme';
import { useSchedule } from './api';
import { formatTime, humanize } from './format';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function Row({ item }: { item: ScheduleItem }) {
  const { colors, spacing, radius } = useTheme();
  const Icon = item.assignment.status === 'IN_PROGRESS' ? PlayCircle : item.assignment.status === 'ACCEPTED' ? ClipboardCheck : Timer;
  const live = item.assignment.status === 'IN_PROGRESS';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.task.title}, ${humanize(item.assignment.status)}`}
      onPress={() => router.push(`/tasks/${item.task.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: live ? colors.successSurface : colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={live ? colors.success : colors.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" numberOfLines={1}>{item.task.title}</AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {[humanize(item.assignment.status), item.event?.title ?? item.task.locationName].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <View style={{ backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 }}>
        <AppText variant="label" style={{ color: colors.inkText }}>
          {live ? 'Now' : formatTime(item.sortAt, item.event?.timezone)}
        </AppText>
      </View>
    </Pressable>
  );
}

export function TodayList({ orgId }: { orgId: string }) {
  const { spacing } = useTheme();
  const schedule = useSchedule(orgId);
  const items = (schedule.data ?? []).filter((s) => s.assignment.status === 'IN_PROGRESS' || isToday(s.sortAt));
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <AppText variant="heading">Today</AppText>
        <AppText variant="caption" tone="muted" onPress={() => router.push('/schedule')}>
          {items.length} task{items.length === 1 ? '' : 's'} · See all
        </AppText>
      </View>
      {schedule.isPending ? <ListSkeleton rows={2} /> : null}
      {!schedule.isPending && !items.length ? (
        <AppText tone="muted">Nothing scheduled for you today.</AppText>
      ) : null}
      {items.map((i) => <Row key={i.assignment.id} item={i} />)}
    </View>
  );
}
