import { View } from 'react-native';
import { router } from 'expo-router';
import { Plane } from 'lucide-react-native';
import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

export default function Welcome() {
  const { colors, spacing } = useTheme();
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <Plane color={colors.primary} size={40} accessibilityElementsHidden />
        <AppText variant="title">TeamPilot AI</AppText>
        <AppText tone="muted">
          Coordinate events, tasks, and staff availability in real time. Managers describe the work; TeamPilot finds
          eligible people and follows it through to completion.
        </AppText>
      </View>
      <View style={{ gap: spacing.md }}>
        <Button label="Create account" onPress={() => router.push('/sign-up')} />
        <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
