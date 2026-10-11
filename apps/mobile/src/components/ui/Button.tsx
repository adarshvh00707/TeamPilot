import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  /** `onInk` is for buttons placed on a dark (ink) card. */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'onInk';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({ label, variant = 'primary', loading, disabled, icon, fullWidth = true, ...rest }: Props) {
  const { colors, radius, spacing } = useTheme();
  const isDisabled = disabled || loading;
  const bg = {
    primary: colors.primary,
    secondary: colors.surfaceMuted,
    danger: colors.danger,
    ghost: 'transparent',
    onInk: 'rgba(255,255,255,0.12)',
  }[variant];
  const fg = variant === 'primary' ? colors.primaryText : variant === 'danger' || variant === 'onInk' ? '#FFFFFF' : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.xl,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
        },
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <AppText variant="label" style={{ color: fg }}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
