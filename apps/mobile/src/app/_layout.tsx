import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { OrgProvider } from '@/features/org/OrgProvider';
import { AppText, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { missingEnv } from '@/lib/env';
import { useTheme } from '@/theme';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

function useAppFocus() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);
}

function MissingConfig() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <AppText variant="title">Configuration required</AppText>
      <AppText tone="muted">
        Set these variables in apps/mobile/.env.local and restart Expo: {missingEnv.join(', ')}. See .env.example.
      </AppText>
    </Screen>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const { colors, dark } = useTheme();
  useAppFocus();

  if (missingEnv.length) return <MissingConfig />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrgProvider>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
              <Stack.Screen name="accept-invite" options={{ title: 'Invitation' }} />
              <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
            </Stack>
          </OrgProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
