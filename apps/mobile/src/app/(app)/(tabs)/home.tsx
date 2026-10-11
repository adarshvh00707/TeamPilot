import { router } from 'expo-router';
import { Bell, ChevronRight, Gauge } from 'lucide-react-native';
import { View } from 'react-native';
import { AppText, Badge, Card, IconButton, Screen } from '@/components/ui';
import { AvailabilityCard } from '@/features/dispatch/AvailabilityCard';
import { OffersCard } from '@/features/dispatch/OffersCard';
import { useOrg } from '@/features/org/OrgProvider';
import { TodayList } from '@/features/work/TodayList';
import { useTheme } from '@/theme';

const today = () => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

export default function HomeScreen() {
  const { me, active, isManager, refetch, loading } = useOrg();
  const { colors, spacing } = useTheme();
  const name = me?.profile.displayName?.split(' ')[0] ?? me?.email ?? 'there';

  return (
    <Screen edges={['top', 'left', 'right']} refreshing={loading} onRefresh={refetch}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" tone="muted">{today()}</AppText>
          <AppText variant="title">Hi, {name}</AppText>
        </View>
        <IconButton icon={<Bell size={20} color={colors.text} />} accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} />
      </View>
      {active ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: -spacing.md }}>
          <AppText tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{active.organizationName}</AppText>
          <Badge label={active.role} tone="neutral" />
        </View>
      ) : null}

      {active ? <OffersCard orgId={active.organizationId} /> : null}
      {active ? <AvailabilityCard orgId={active.organizationId} /> : null}
      {active ? <TodayList orgId={active.organizationId} /> : null}

      {isManager ? (
        <Card onPress={() => router.push('/operations')} accessibilityLabel="Open manager operations">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
              <Gauge size={20} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">Operations</AppText>
              <AppText tone="muted">Events, roster, team, and locations</AppText>
            </View>
            <ChevronRight color={colors.textMuted} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
