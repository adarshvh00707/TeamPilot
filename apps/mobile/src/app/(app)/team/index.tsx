import { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ROLES, ROLE_RANK, type Member, type Role } from '@teampilot/shared';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useInvitations, useMembers, useRevokeInvitation, useUpdateMember } from '@/features/org/api';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

function canManage(actor: Role | null, target: Role) {
  if (!actor) return false;
  return actor === 'OWNER' || ROLE_RANK[actor] > ROLE_RANK[target];
}

export default function TeamScreen() {
  const orgId = useActiveOrgId();
  const { role, isAdmin, me } = useOrg();
  const { colors, spacing } = useTheme();
  const members = useMembers(orgId);
  const invitations = useInvitations(orgId, isAdmin);
  const revoke = useRevokeInvitation(orgId);
  const update = useUpdateMember(orgId);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = members.data?.pages.flatMap((p) => p.data) ?? [];

  const changeRole = (m: Member, next: Role) =>
    update.mutate({ userId: m.userId, role: next }, { onSuccess: () => setExpanded(null) });

  const confirmSuspend = (m: Member) =>
    Alert.alert('Suspend member?', `${m.displayName ?? 'This member'} will lose access to this organization.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => update.mutate({ userId: m.userId, status: 'SUSPENDED' }) },
    ]);

  const header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      {isAdmin ? <Button label="Invite member" onPress={() => router.push('/team/invite')} /> : null}
      {update.error ? <ErrorState message={errorMessage(update.error)} /> : null}
      {isAdmin && invitations.data?.length ? (
        <Card>
          <AppText variant="heading">Pending invitations</AppText>
          {invitations.data.map((inv) => (
            <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppText>{inv.email}</AppText>
                <AppText variant="caption" tone="muted">
                  {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                </AppText>
              </View>
              <Button
                label="Revoke"
                variant="ghost"
                fullWidth={false}
                onPress={() =>
                  Alert.alert('Revoke invitation?', inv.email, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Revoke', style: 'destructive', onPress: () => revoke.mutate(inv.id) },
                  ])
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
      <AppText variant="heading">Members</AppText>
    </View>
  );

  if (members.isPending) return <View style={{ padding: spacing.lg }}><ListSkeleton /></View>;
  if (members.error) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorState message={errorMessage(members.error)} onRetry={() => void members.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={rows}
      keyExtractor={(m) => m.userId}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState title="No members yet" />}
      refreshing={members.isRefetching}
      onRefresh={() => void members.refetch()}
      onEndReached={() => members.hasNextPage && !members.isFetchingNextPage && void members.fetchNextPage()}
      renderItem={({ item: m }) => {
        const isSelf = m.userId === me?.profile.id;
        const manageable = isAdmin && !isSelf && canManage(role, m.role);
        const open = expanded === m.userId;
        return (
          <Card>
            <Pressable
              disabled={!manageable}
              accessibilityRole={manageable ? 'button' : undefined}
              accessibilityLabel={`${m.displayName ?? 'Unnamed member'}, ${m.role}`}
              accessibilityHint={manageable ? 'Shows role options' : undefined}
              onPress={() => setExpanded(open ? null : m.userId)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}
            >
              <AppText style={{ flex: 1 }}>
                {m.displayName ?? 'Unnamed member'}
                {isSelf ? ' (you)' : ''}
              </AppText>
              <Badge label={m.role} tone={m.role === 'OWNER' || m.role === 'ADMIN' ? 'info' : 'neutral'} />
            </Pressable>
            {open ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {ROLES.filter((r) => r !== m.role && (role === 'OWNER' || ROLE_RANK[r] <= ROLE_RANK[role!])).map((r) => (
                    <Button key={r} label={`Make ${r}`} variant="secondary" fullWidth={false} loading={update.isPending} onPress={() => changeRole(m, r)} />
                  ))}
                </View>
                <Button label="Suspend member" variant="ghost" onPress={() => confirmSuspend(m)} />
              </View>
            ) : null}
          </Card>
        );
      }}
    />
  );
}
