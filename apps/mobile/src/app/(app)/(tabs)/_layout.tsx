import { Redirect, Tabs } from 'expo-router';
import { Bell, CalendarDays, ClipboardList, Gauge, Home, User } from 'lucide-react-native';
import { ErrorState, LargeHeader, ListSkeleton, PillTabBar, Screen } from '@/components/ui';
import { useInbox } from '@/features/notifications/api';
import { useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { loading, error, refetch, memberships, isManager, active } = useOrg();
  const { colors } = useTheme();
  const unread = useInbox(active?.organizationId ?? '', !!active).data?.unread ?? 0;

  if (loading) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <ListSkeleton />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      </Screen>
    );
  }
  if (memberships.length === 0) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        header: ({ options, route }) => (
          <LargeHeader title={options.title ?? route.name} right={options.headerRight?.({ tintColor: colors.text, canGoBack: false })} />
        ),
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen
        name="operations"
        options={{
          title: 'Operations',
          tabBarLabel: 'Ops',
          // Navigation visibility is a convenience only; the API enforces manager permissions.
          href: isManager ? undefined : null,
          tabBarIcon: ({ color, size }) => <Gauge color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications', tabBarLabel: 'Inbox', tabBarBadge: unread ? (unread > 9 ? '9+' : unread) : undefined, tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
