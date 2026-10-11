import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const { colors } = useTheme();
  if (!initializing && !session) return <Redirect href="/welcome" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
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
    </Stack>
  );
}
