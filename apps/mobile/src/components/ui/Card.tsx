import { Pressable, View, type ViewProps } from 'react-native';
import { useTheme } from '@/theme';

interface Props extends ViewProps {
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Card({ style, onPress, children, accessibilityLabel, ...rest }: Props) {
  const { colors, radius, spacing } = useTheme();
  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
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
        style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.85 : 1 }, style as object]}
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
