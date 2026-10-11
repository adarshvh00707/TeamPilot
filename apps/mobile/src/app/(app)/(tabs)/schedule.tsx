import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { ScheduleItem } from '@teampilot/shared';
import { AppText, EmptyState, ErrorState, ListSkeleton, Screen } from '@/components/ui';
import { useActiveOrgId } from '@/features/org/OrgProvider';
import { AssignmentActions } from '@/features/work/AssignmentActions';
import { useSchedule } from '@/features/work/api';
import { dayKey, MonthCalendar, type DayMarker } from '@/features/work/MonthCalendar';
import { ScheduleRow } from '@/features/work/TodayList';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** A day that needs a response outranks one with work, which outranks one with only finished work. */
function markersFor(items: ScheduleItem[]) {
  const rank: Record<DayMarker, number> = { action: 3, busy: 2, done: 1 };
  const map = new Map<string, DayMarker>();
  for (const i of items) {
    const m: DayMarker = i.assignment.status === 'ASSIGNED' ? 'action' : i.assignment.status === 'COMPLETED' ? 'done' : 'busy';
    const key = dayKey(new Date(i.sortAt));
    const prev = map.get(key);
    if (!prev || rank[m] > rank[prev]) map.set(key, m);
  }
  return map;
}

export default function ScheduleScreen() {
  const orgId = useActiveOrgId();
  const { spacing } = useTheme();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const range = useMemo(() => ({ from: month, to: new Date(month.getFullYear(), month.getMonth() + 1, 1) }), [month]);
  const schedule = useSchedule(orgId, range);

  const items = schedule.data ?? [];
  const markers = useMemo(() => markersFor(items), [items]);
  const dayItems = items.filter((i) => dayKey(new Date(i.sortAt)) === dayKey(selected));
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(selected);

  return (
    <Screen refreshing={schedule.isRefetching} onRefresh={() => void schedule.refetch()}>
      <MonthCalendar
        month={month}
        selected={selected}
        markers={markers}
        onSelect={setSelected}
        onMonthChange={(delta) => {
          const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
          setMonth(next);
          setSelected(dayKey(next) === dayKey(startOfMonth(new Date())) ? new Date() : next);
        }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <AppText variant="heading">{dayKey(selected) === dayKey(new Date()) ? 'Today' : dayLabel}</AppText>
        <AppText variant="caption" tone="muted">
          {dayItems.length} task{dayItems.length === 1 ? '' : 's'}
        </AppText>
      </View>

      {schedule.isPending ? <ListSkeleton rows={2} /> : null}
      {schedule.error ? <ErrorState message={errorMessage(schedule.error)} onRetry={() => void schedule.refetch()} /> : null}
      {!schedule.isPending && !dayItems.length ? <EmptyState title="Nothing this day" message="Pick a day with a dot to see your tasks." /> : null}
      {dayItems.map((item) => (
        <View key={item.assignment.id} style={{ gap: spacing.sm }}>
          <ScheduleRow item={item} />
          {item.assignment.status === 'ASSIGNED' ? (
            <AssignmentActions orgId={orgId} assignmentId={item.assignment.id} status={item.assignment.status} />
          ) : null}
        </View>
      ))}
    </Screen>
  );
}
