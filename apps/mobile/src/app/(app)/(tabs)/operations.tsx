import { router } from 'expo-router';
import { Activity, CalendarDays, ChevronRight, MapPin, Users } from 'lucide-react-native';
import { View } from 'react-native';
import { AppText, Card, ErrorState, Screen, UnavailableNotice } from '@/components/ui';
import { useOrg } from '@/features/org/OrgProvider';
import { useTheme } from '@/theme';

export default function OperationsScreen() {
  const { isManager } = useOrg();
  const { colors, spacing } = useTheme();

  if (!isManager) {
    return (
      <Screen>
        <ErrorState message="Manager access is required for operations." />
      </Screen>
    );
  }

  const Row = ({ icon, title, subtitle, href }: { icon: React.ReactNode; title: string; subtitle: string; href: '/team' | '/locations' | '/events' | '/roster' }) => (
    <Card onPress={() => router.push(href)} accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {icon}
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{title}</AppText>
          <AppText tone="muted">{subtitle}</AppText>
        </View>
        <ChevronRight color={colors.textMuted} />
      </View>
    </Card>
  );

  return (
    <Screen>
      <Row icon={<CalendarDays color={colors.primary} />} title="Events" subtitle="Plan events, publish them, and add tasks" href="/events" />
      <Row icon={<Activity color={colors.primary} />} title="Live roster" subtitle="Who is clocked in, on break, or paused" href="/roster" />
      <Row icon={<Users color={colors.primary} />} title="Team" subtitle="Members, roles, and invitations" href="/team" />
      <Row icon={<MapPin color={colors.primary} />} title="Locations" subtitle="Rooms and areas where work happens" href="/locations" />
      <UnavailableNotice feature="Push alerts for offers and escalations, and verified clock-ins" phase="Phases 4 and 6" />
    </Screen>
  );
}
