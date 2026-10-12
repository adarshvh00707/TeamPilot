import { Redirect, router, Stack } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Platform, View } from 'react-native';
import { IconButton, ListSkeleton, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePushNotifications } from '@/features/notifications/push';
import { useOrg } from '@/features/org/OrgProvider';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const { loading, active } = useOrg();
  const { colors, spacing } = useTheme();
  usePushNotifications(session ? active?.organizationId : undefined);
  if (!initializing && !session) return <Redirect href="/welcome" />;
  // Deep links can land on any screen; hold rendering until the session and memberships are known.
  if (initializing || loading) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <ListSkeleton />
      </Screen>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerTitleAlign: 'center',
        headerBackVisible: false,
        headerLeft: () => (
          <View style={{ marginLeft: Platform.OS === 'web' ? spacing.lg : 0 }}>
            <IconButton
              icon={<ChevronLeft size={22} color={colors.text} />}
              accessibilityLabel="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            />
          </View>
        ),
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Create organization' }} />
      <Stack.Screen name="organizations" options={{ title: 'Organizations' }} />
      <Stack.Screen name="team/index" options={{ title: 'Team' }} />
      <Stack.Screen name="team/invite" options={{ title: 'Invite member', presentation: 'modal' }} />
      <Stack.Screen name="locations/index" options={{ title: 'Locations' }} />
      <Stack.Screen name="locations/new" options={{ title: 'New location', presentation: 'modal' }} />
      <Stack.Screen name="events/index" options={{ title: 'Events' }} />
      <Stack.Screen name="events/new" options={{ title: 'New event', presentation: 'modal' }} />
      <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="tasks/new" options={{ title: 'New task', presentation: 'modal' }} />
      <Stack.Screen name="tasks/[id]" options={{ title: 'Task' }} />
      <Stack.Screen name="roster" options={{ title: 'Live roster' }} />
    </Stack>
  );
}
