import { router } from 'expo-router';
import { AlertTriangle, Clock, Send, Users } from 'lucide-react-native';
import { View } from 'react-native';
import type { ManagerDashboard } from '@teampilot/shared';
import { AppText, Card, ErrorState, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { useDashboard } from './api';

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function useScaleColor() {
  const { scale } = useTheme();
  return (percent: number) => (percent < 40 ? scale.low : percent < 75 ? scale.mid : scale.high);
}

function ProgressBar({ percent }: { percent: number }) {
  const { colors } = useTheme();
  const color = useScaleColor()(percent);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, percent)}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
      </View>
      <AppText variant="label">{percent}%</AppText>
    </View>
  );
}

function StatCard(props: { title: string; icon: React.ReactNode; value: string; caption: string; percent?: number; onPress?: () => void; alert?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <Card onPress={props.onPress} accessibilityLabel={`${props.title}: ${props.value}`} style={{ flex: 1, minWidth: 150, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="label">{props.title}</AppText>
        {props.icon}
      </View>
      <AppText variant="display" style={{ color: props.alert ? colors.danger : colors.text, fontSize: 38, lineHeight: 44 }}>
        {props.value}
      </AppText>
      <AppText variant="caption" tone="muted" numberOfLines={1}>{props.caption}</AppText>
      {props.percent !== undefined ? <View style={{ marginTop: spacing.xs }}><ProgressBar percent={props.percent} /></View> : null}
    </Card>
  );
}

function TrendChart({ days }: { days: ManagerDashboard['completedByDay'] }) {
  const { colors, spacing } = useTheme();
  const colorFor = useScaleColor();
  const max = Math.max(1, ...days.map((d) => d.completed));
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96 }}>
        {days.map((d) => {
          const p = pct(d.completed, max);
          return (
            <View key={d.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <View
                accessibilityLabel={`${d.day}: ${d.completed} completed`}
                style={{ width: '100%', height: `${Math.max(6, p)}%`, borderRadius: 8, backgroundColor: d.completed ? colorFor(p) : colors.surfaceMuted }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d) => (
          <AppText key={d.day} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center' }}>
            {new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d.day}T12:00:00Z`))}
          </AppText>
        ))}
      </View>
    </View>
  );
}

export function Dashboard({ orgId }: { orgId: string }) {
  const { colors, spacing } = useTheme();
  const dashboard = useDashboard(orgId);
  const colorFor = useScaleColor();

  if (dashboard.isPending) return <Skeleton height={260} />;
  if (dashboard.error) return <ErrorState message={errorMessage(dashboard.error)} onRetry={() => void dashboard.refetch()} />;
  const d = dashboard.data;
  const staffedPct = pct(d.staffing.staffed, d.staffing.required);
  const acceptPct = pct(d.offers.acceptedLast7Days, d.offers.sentLast7Days);
  const weekTotal = d.completedByDay.reduce((s, x) => s + x.completed, 0);
  const median = d.offers.medianResponseSeconds;

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.md, padding: spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="heading">Staffing now</AppText>
          <AppText variant="heading" style={{ color: d.staffing.required ? colorFor(staffedPct) : colors.textMuted }}>
            {d.staffing.required ? `${staffedPct}%` : '—'}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <AppText variant="display">{d.staffing.staffed}</AppText>
          <AppText variant="heading" tone="muted">/ {d.staffing.required} people on {d.staffing.openTasks} open tasks</AppText>
        </View>
        <AppText variant="caption" tone="muted">Completed in the last 7 days: {weekTotal}</AppText>
        <TrendChart days={d.completedByDay} />
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard
          title="Clocked in"
          icon={<Users size={18} color={colors.text} />}
          value={String(d.people.clockedIn)}
          caption={`of ${d.people.staff} staff · ${d.people.onBreak} on break`}
          percent={pct(d.people.clockedIn, d.people.staff)}
          onPress={() => router.push('/roster')}
        />
        <StatCard
          title="Open offers"
          icon={<Send size={18} color={colors.text} />}
          value={String(d.offers.open)}
          caption={`${d.offers.acceptedLast7Days}/${d.offers.sentLast7Days} accepted (7d)`}
          percent={acceptPct}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard
          title="Needs attention"
          icon={<AlertTriangle size={18} color={d.staffing.needsAttention ? colors.danger : colors.text} />}
          value={String(d.staffing.needsAttention)}
          caption={d.staffing.needsAttention ? 'Tap to review escalated tasks' : 'Nothing escalated'}
          alert={d.staffing.needsAttention > 0}
          onPress={() => router.push({ pathname: '/tasks', params: { status: 'NEEDS_MANAGER_ATTENTION' } })}
        />
        <StatCard
          title="Response time"
          icon={<Clock size={18} color={colors.text} />}
          value={median === null ? '—' : median < 60 ? `${median}s` : `${Math.round(median / 60)}m`}
          caption="Median time to answer an offer (7d)"
        />
      </View>
    </View>
  );
}
