import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { View } from 'react-native';
import { AppText, Badge, Button, Card, Screen } from '@/components/ui';
import { useOrg } from '@/features/org/OrgProvider';
import { useTheme } from '@/theme';

export default function OrganizationSwitcher() {
  const { memberships, active, setActiveOrganization } = useOrg();
  const { colors, spacing } = useTheme();

  return (
    <Screen>
      {memberships.map((m) => {
        const selected = m.organizationId === active?.organizationId;
        return (
          <Card
            key={m.organizationId}
            accessibilityLabel={`${m.organizationName}, ${m.role}${selected ? ', selected' : ''}`}
            onPress={async () => {
              await setActiveOrganization(m.organizationId);
              router.back();
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <AppText variant="heading">{m.organizationName}</AppText>
                <Badge label={m.role} tone="neutral" />
              </View>
              {selected ? <Check color={colors.primary} /> : null}
            </View>
          </Card>
        );
      })}
      <Button label="Create another organization" variant="secondary" onPress={() => router.push('/onboarding')} />
    </Screen>
  );
}
