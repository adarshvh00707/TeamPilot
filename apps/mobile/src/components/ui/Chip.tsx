import { Pressable } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={4}
      style={{
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.ink : colors.surfaceMuted,
      }}
    >
      <AppText variant="caption" style={{ color: selected ? colors.inkText : colors.text, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
