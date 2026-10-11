import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme';

export default function AuthLayout() {
  const { session, initializing } = useAuth();
  const { colors } = useTheme();
  if (!initializing && session) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Forgot password' }} />
      <Stack.Screen name="verify-email" options={{ title: 'Verify email' }} />
    </Stack>
  );
}
