import { router } from 'expo-router';
import { Activity, CalendarDays, ChevronRight, MapPin, Users } from 'lucide-react-native';
import { View } from 'react-native';
import { AppText, Card, ErrorState, Screen } from '@/components/ui';
import { Dashboard } from '@/features/dispatch/Dashboard';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { useTheme } from '@/theme';

type Href = '/team' | '/locations' | '/events' | '/roster';

export default function OperationsScreen() {
  const { isManager } = useOrg();
  const orgId = useActiveOrgId();
  const { colors, spacing } = useTheme();

  if (!isManager) {
    return (
      <Screen>
        <ErrorState message="Manager access is required for operations." />
      </Screen>
    );
  }

  const Row = ({ icon, title, subtitle, href }: { icon: React.ReactNode; title: string; subtitle: string; href: Href }) => (
    <Card onPress={() => router.push(href)} accessibilityLabel={title} style={{ paddingVertical: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <AppText variant="label">{title}</AppText>
          <AppText variant="caption" tone="muted">{subtitle}</AppText>
        </View>
        <ChevronRight color={colors.textMuted} size={18} />
      </View>
    </Card>
  );

  return (
    <Screen>
      <Dashboard orgId={orgId} />
      <AppText variant="heading" style={{ marginTop: spacing.sm }}>Manage</AppText>
      <Row icon={<CalendarDays size={20} color={colors.text} />} title="Events" subtitle="Plan events, publish them, and add tasks" href="/events" />
      <Row icon={<Activity size={20} color={colors.text} />} title="Live roster" subtitle="Who is clocked in, on break, or paused" href="/roster" />
      <Row icon={<Users size={20} color={colors.text} />} title="Team" subtitle="Members, roles, and invitations" href="/team" />
      <Row icon={<MapPin size={20} color={colors.text} />} title="Locations" subtitle="Rooms and areas where work happens" href="/locations" />
    </Screen>
  );
}
