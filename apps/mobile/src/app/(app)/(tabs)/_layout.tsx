import { Redirect, Tabs } from 'expo-router';
import { Bell, CalendarDays, ClipboardList, Gauge, Home, User } from 'lucide-react-native';
import { ErrorState, ListSkeleton, Screen } from '@/components/ui';
import { useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { loading, error, refetch, memberships, isManager } = useOrg();
  const { colors } = useTheme();

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
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen
        name="operations"
        options={{
          title: 'Operations',
          // Navigation visibility is a convenience only; the API enforces manager permissions.
          href: isManager ? undefined : null,
          tabBarIcon: ({ color, size }) => <Gauge color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications', tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
