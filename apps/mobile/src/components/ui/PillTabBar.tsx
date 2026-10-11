import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tabs } from 'expo-router';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Floating dark pill; the active tab expands into a light pill with its label. */
export function PillTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ backgroundColor: colors.background, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.ink,
          borderRadius: radius.pill,
          padding: 6,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 520,
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          // expo-router hides `href: null` tabs this way.
          if ((options.tabBarItemStyle as { display?: string } | undefined)?.display === 'none') return null;
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const fg = focused ? colors.ink : '#A1A1AA';
          const badge = options.tabBarBadge;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 52,
                minWidth: 52,
                justifyContent: 'center',
                paddingHorizontal: focused ? spacing.gutter : spacing.md,
                borderRadius: radius.pill,
                backgroundColor: focused ? colors.surface : 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View>
                {options.tabBarIcon?.({ focused, color: fg, size: 20 })}
                {badge ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      paddingHorizontal: 3,
                      backgroundColor: colors.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppText style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '700' }}>{String(badge)}</AppText>
                  </View>
                ) : null}
              </View>
              {focused ? (
                <AppText variant="label" style={{ color: fg }} numberOfLines={1}>
                  {label}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Large left-aligned title with optional round action buttons, used as the tab screens' header. */
export function LargeHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.gutter,
        paddingBottom: spacing.sm,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
      }}
    >
      <AppText variant="title" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </AppText>
      {right ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>{right}</View> : null}
    </View>
  );
}

/** Round icon button for headers and cards. */
export function IconButton({ icon, onPress, accessibilityLabel, tone = 'default' }: { icon: React.ReactNode; onPress: () => void; accessibilityLabel: string; tone?: 'default' | 'ink' }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'ink' ? colors.ink : colors.surface,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      {icon}
    </Pressable>
  );
}
