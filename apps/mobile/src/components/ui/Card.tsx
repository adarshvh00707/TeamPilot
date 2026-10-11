import { Pressable, View, type ViewProps } from 'react-native';
import { useTheme } from '@/theme';

interface Props extends ViewProps {
  onPress?: () => void;
  accessibilityLabel?: string;
  /** `muted` sits on a surface (nested rows); `ink` is the dark highlight card. */
  tone?: 'default' | 'muted' | 'ink';
}

export function Card({ style, onPress, children, accessibilityLabel, tone = 'default', ...rest }: Props) {
  const { colors, radius, spacing } = useTheme();
  const cardStyle = {
    backgroundColor: tone === 'ink' ? colors.ink : tone === 'muted' ? colors.surfaceMuted : colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [cardStyle, { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: pressed ? 0.92 : 1 }, style as object]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[cardStyle, style]} {...rest}>
      {children}
    </View>
  );
}
