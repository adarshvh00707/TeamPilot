import { Text, type TextProps } from 'react-native';
import { useTheme } from '@/theme';
import type { TypographyVariant } from '@/theme/tokens';

interface Props extends TextProps {
  variant?: TypographyVariant;
  tone?: 'default' | 'muted' | 'danger' | 'success' | 'primary';
}

export function AppText({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const { colors, typography } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    danger: colors.danger,
    success: colors.success,
    primary: colors.primary,
  }[tone];
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      style={[typography[variant], { color }, style]}
      {...rest}
    />
  );
}
