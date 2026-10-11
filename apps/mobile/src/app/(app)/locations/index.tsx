import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useArchiveLocation, useLocations } from '@/features/org/api';
import { useActiveOrgId, useOrg } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

export default function LocationsScreen() {
  const orgId = useActiveOrgId();
  const { isManager } = useOrg();
  const { colors, spacing } = useTheme();
  const locations = useLocations(orgId);
  const archive = useArchiveLocation(orgId);
  const rows = locations.data?.pages.flatMap((p) => p.data) ?? [];

  if (locations.isPending) return <View style={{ padding: spacing.lg }}><ListSkeleton /></View>;
  if (locations.error) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorState message={errorMessage(locations.error)} onRetry={() => void locations.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={rows}
      keyExtractor={(l) => l.id}
      refreshing={locations.isRefetching}
      onRefresh={() => void locations.refetch()}
      onEndReached={() => locations.hasNextPage && !locations.isFetchingNextPage && void locations.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
          {isManager ? <Button label="Add location" onPress={() => router.push('/locations/new')} /> : null}
          {archive.error ? <ErrorState message={errorMessage(archive.error)} /> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState title="No locations yet" message="Add the rooms and areas where events and tasks happen, like Atrium or L70." />
      }
      renderItem={({ item }) => (
        <Card>
          <AppText variant="heading">{item.name}</AppText>
          {item.description ? <AppText tone="muted">{item.description}</AppText> : null}
          {isManager ? (
            <Button
              label="Archive"
              variant="ghost"
              fullWidth={false}
              onPress={() =>
                Alert.alert('Archive location?', `${item.name} will no longer be offered for new events and tasks.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Archive', style: 'destructive', onPress: () => archive.mutate(item.id) },
                ])
              }
            />
          ) : null}
        </Card>
      )}
    />
  );
}
