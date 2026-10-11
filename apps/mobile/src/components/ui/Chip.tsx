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
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.infoSurface : colors.surface,
      }}
    >
      <AppText variant="caption" style={{ color: selected ? colors.primary : colors.text, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
