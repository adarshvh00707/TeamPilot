import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registeredToken: string | null = null;

/** Returns null (and does nothing) on web, simulators, or when permission is denied. */
async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Task alerts', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Best-effort: called before sign-out so the device stops receiving the previous user's alerts. */
export async function revokePushToken() {
  if (!registeredToken) return;
  await api.post('/me/devices/revoke', { pushToken: registeredToken }).catch(() => undefined);
  registeredToken = null;
}

const openFrom = (response: Notifications.NotificationResponse | null) => {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
};

/** Registers this device for push and routes notification taps. Mount once inside the signed-in area. */
export function usePushNotifications(orgId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getPushToken()
      .then(async (token) => {
        if (!token || cancelled || token === registeredToken) return;
        await api.post(`/me/devices?organizationId=${orgId}`, { pushToken: token, platform: Platform.OS });
        registeredToken = token;
      })
      .catch((err) => console.warn('Push registration failed', err));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.getLastNotificationResponseAsync().then(openFrom);
    const tapped = Notifications.addNotificationResponseReceivedListener(openFrom);
    // Something changed server-side; refresh offers, tasks, and the inbox.
    const received = Notifications.addNotificationReceivedListener(() => void qc.invalidateQueries({ queryKey: ['org'] }));
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [qc]);
}
