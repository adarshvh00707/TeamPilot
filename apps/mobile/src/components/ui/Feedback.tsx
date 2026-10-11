import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { AlertTriangle, Construction, Inbox } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

export function Badge({ label, tone = 'info' }: { label: string; tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }) {
  const { colors, radius, spacing } = useTheme();
  const map = {
    info: [colors.infoSurface, colors.info],
    success: [colors.successSurface, colors.success],
    warning: [colors.warningSurface, colors.warning],
    danger: [colors.dangerSurface, colors.danger],
    neutral: [colors.surfaceMuted, colors.textMuted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <AppText variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }}>
      <Inbox color={colors.textMuted} size={32} accessibilityElementsHidden />
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {message ? (
        <AppText tone="muted" style={{ textAlign: 'center' }}>
          {message}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: colors.dangerSurface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <AlertTriangle color={colors.danger} size={18} />
        <AppText tone="danger" style={{ flex: 1 }}>
          {message}
        </AppText>
      </View>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Marks a feature that is intentionally not yet available, so no control appears to work when it does not. */
export function UnavailableNotice({ feature, phase }: { feature: string; phase: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      accessibilityRole="text"
      style={{ backgroundColor: colors.warningSurface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Construction color={colors.warning} size={18} />
        <AppText variant="label" style={{ color: colors.warning }}>
          Not available yet
        </AppText>
      </View>
      <AppText tone="muted">
        {feature} arrives in {phase}. Nothing on this screen is simulated.
      </AppText>
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | `${number}%` }) {
  const { colors, radius } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, opacity }}
    />
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={56} />
      ))}
    </View>
  );
}
