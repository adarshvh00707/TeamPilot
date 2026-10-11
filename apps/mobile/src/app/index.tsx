import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { pendingInvite } from '@/features/auth/auth-links';
import { useTheme } from '@/theme';

export default function Index() {
  const { session, initializing } = useAuth();
  const { colors } = useTheme();
  const [invite, setInvite] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    pendingInvite.get().then(setInvite).catch(() => setInvite(null));
  }, []);

  if (initializing || invite === undefined) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!session) return <Redirect href="/welcome" />;
  if (invite) return <Redirect href={{ pathname: '/accept-invite', params: { token: invite } }} />;
  return <Redirect href="/home" />;
}
