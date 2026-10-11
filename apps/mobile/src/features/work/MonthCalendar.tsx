import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme';

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first grid of the month containing `month`; leading blanks are null. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export type DayMarker = 'action' | 'busy' | 'done';

interface Props {
  month: Date;
  selected: Date;
  markers: Map<string, DayMarker>;
  onSelect: (d: Date) => void;
  onMonthChange: (delta: number) => void;
}

export function MonthCalendar({ month, selected, markers, onSelect, onMonthChange }: Props) {
  const { colors, spacing, scale } = useTheme();
  const todayKey = dayKey(new Date());
  const markerColor: Record<DayMarker, string> = { action: scale.low, busy: scale.high, done: colors.textMuted };
  const cells = monthGrid(month);
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month);

  const arrow = (delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta < 0 ? 'Previous month' : 'Next month'}
      onPress={() => onMonthChange(delta)}
      hitSlop={8}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surfaceMuted : 'transparent' })}
    >
      {delta < 0 ? <ChevronLeft size={18} color={colors.text} /> : <ChevronRight size={18} color={colors.text} />}
    </Pressable>
  );

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="label">{label}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {arrow(-1)}
          {arrow(1)}
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d, i) => (
          <AppText key={i} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}>
            {d}
          </AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xs }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const key = dayKey(d);
          const isSelected = key === dayKey(selected);
          const isToday = key === todayKey;
          const marker = markers.get(key);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${d.toDateString()}${marker ? ', has tasks' : ''}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(d)}
              style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? colors.ink : marker ? colors.background : 'transparent',
                  borderWidth: isToday && !isSelected ? 1.5 : 0,
                  borderColor: colors.ink,
                }}
              >
                <AppText variant="label" style={{ color: isSelected ? colors.inkText : colors.text, fontWeight: isSelected || isToday ? '700' : '500' }}>
                  {d.getDate()}
                </AppText>
              </View>
              <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: marker ? markerColor[marker] : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
