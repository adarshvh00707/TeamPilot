import { router } from 'expo-router';
import { Platform, Switch, View } from 'react-native';
import { AppText, Button, Card, EmptyState, ErrorState, ListSkeleton, Screen } from '@/components/ui';
import { useInbox, useMarkRead } from '@/features/notifications/api';
import { useUpdateProfile } from '@/features/org/api';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { formatDateTime } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const PUSH_PREFS = [
  { key: 'TASK_OFFER', label: 'Task offers' },
  { key: 'TASK_ASSIGNED', label: 'Tasks assigned to me' },
  { key: 'ESCALATION', label: 'Escalations (managers)' },
] as const;

function PushPreferences() {
  const { me } = useOrg();
  const { colors, spacing } = useTheme();
  const update = useUpdateProfile();
  const prefs = me?.profile.notificationPreferences ?? {};
  return (
    <Card>
      <AppText variant="heading">Push notifications</AppText>
      <AppText tone="muted">
        {Platform.OS === 'web' ? 'Push is available in the mobile app. ' : ''}Turned-off alerts still appear in this inbox.
      </AppText>
      {PUSH_PREFS.map((p) => (
        <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText style={{ flex: 1 }}>{p.label}</AppText>
          <Switch
            accessibilityLabel={p.label}
            trackColor={{ false: colors.surfaceMuted, true: colors.ink }}
            thumbColor="#FFFFFF"
            {...({ activeThumbColor: '#FFFFFF' } as object)}
            value={prefs[p.key] !== false}
            disabled={update.isPending}
            onValueChange={(v) => update.mutate({ notificationPreferences: { [p.key]: v } })}
          />
        </View>
      ))}
      {update.error ? <ErrorState message={errorMessage(update.error)} /> : null}
    </Card>
  );
}

export default function NotificationsScreen() {
  const orgId = useActiveOrgId();
  const { spacing, colors } = useTheme();
  const inbox = useInbox(orgId);
  const markRead = useMarkRead(orgId);

  return (
    <Screen refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
      {inbox.isPending ? <ListSkeleton /> : null}
      {inbox.error ? <ErrorState message={errorMessage(inbox.error)} onRetry={() => void inbox.refetch()} /> : null}
      {inbox.data ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="heading">{inbox.data.unread ? `${inbox.data.unread} unread` : 'All caught up'}</AppText>
            {inbox.data.unread ? (
              <Button label="Mark all read" variant="secondary" fullWidth={false} loading={markRead.isPending} onPress={() => markRead.mutate(undefined)} />
            ) : null}
          </View>
          {!inbox.data.items.length ? <EmptyState title="No notifications yet" message="Offers, assignments, and alerts will show up here." /> : null}
          {inbox.data.items.map((n) => (
            <Card
              key={n.id}
              accessibilityLabel={n.title}
              onPress={() => {
                if (!n.readAt) markRead.mutate(n.id);
                if (n.data.url) router.push(n.data.url as never);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                <AppText variant="label" style={{ flex: 1 }}>{n.title}</AppText>
              </View>
              {n.body ? <AppText tone="muted">{n.body}</AppText> : null}
              <AppText variant="caption" tone="muted">{formatDateTime(n.createdAt)}</AppText>
            </Card>
          ))}
        </>
      ) : null}
      <PushPreferences />
    </Screen>
  );
}
