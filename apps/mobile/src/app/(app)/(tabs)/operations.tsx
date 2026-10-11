import { router } from 'expo-router';
import { ChevronRight, MapPin, Users } from 'lucide-react-native';
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

  const Row = ({ icon, title, subtitle, href }: { icon: React.ReactNode; title: string; subtitle: string; href: '/team' | '/locations' }) => (
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
      <Row icon={<Users color={colors.primary} />} title="Team" subtitle="Members, roles, and invitations" href="/team" />
      <Row icon={<MapPin color={colors.primary} />} title="Locations" subtitle="Rooms and areas where work happens" href="/locations" />
      <UnavailableNotice
        feature="Live staffing, verified clock-ins, dispatch queue, offers, and escalations"
        phase="Phases 2–4"
      />
    </Screen>
  );
}
