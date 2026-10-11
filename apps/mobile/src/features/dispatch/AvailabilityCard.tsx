import { View } from 'react-native';
import type { MyAvailability } from '@teampilot/shared';
import { AppText, Badge, Button, Card, ErrorState, ListSkeleton } from '@/components/ui';
import { formatTime, humanize } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { useAvailabilityAction, useMyAvailability, type AvailabilityAction } from './api';

export const availabilityTone = (s: MyAvailability['status']) =>
  s === 'AVAILABLE' ? 'success' : s === 'OFF_SHIFT' || s === 'UNKNOWN' ? 'neutral' : 'warning';

/** Clock-ins here are self-reported, so they are always labelled as unverified. */
export const verificationLabel = (v: MyAvailability['verification']) =>
  v === 'VERIFIED' ? 'Verified' : v === 'MANUAL' ? 'Unverified (manual)' : humanize(v);

export function AvailabilityCard({ orgId }: { orgId: string }) {
  const { spacing } = useTheme();
  const availability = useMyAvailability(orgId);
  const action = useAvailabilityAction(orgId);
  const a = availability.data;

  const btn = (label: string, act: AvailabilityAction, variant: 'primary' | 'secondary' = 'secondary', body?: object) => (
    <View key={act} style={{ flex: 1 }}>
      <Button
        label={label}
        variant={variant}
        loading={action.isPending && action.variables?.action === act}
        disabled={action.isPending}
        onPress={() => action.mutate({ action: act, body })}
      />
    </View>
  );

  return (
    <Card>
      <AppText variant="heading">Availability</AppText>
      {availability.isPending ? <ListSkeleton rows={1} /> : null}
      {availability.error ? <ErrorState message={errorMessage(availability.error)} onRetry={() => void availability.refetch()} /> : null}
      {a ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Badge label={humanize(a.status)} tone={availabilityTone(a.status)} />
            {a.clockedInAt ? <Badge label={verificationLabel(a.verification)} tone="neutral" /> : null}
            {a.paused ? <Badge label="Offers paused" tone="warning" /> : null}
          </View>
          {a.clockedInAt ? <AppText tone="muted">Clocked in at {formatTime(a.clockedInAt)}</AppText> : null}
          {a.activeBreak ? <AppText tone="muted">On break until {formatTime(a.activeBreak.expectedEndAt)}</AppText> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {!a.clockedInAt
              ? btn('Clock in', 'clock-in', 'primary')
              : [
                  a.activeBreak ? btn('End break', 'breaks/end', 'primary') : btn('Start 15 min break', 'breaks/start', 'secondary', { minutes: 15 }),
                  a.paused ? btn('Resume offers', 'resume', 'primary') : btn('Pause offers', 'pause'),
                ]}
          </View>
          {a.clockedInAt ? btn('Clock out', 'clock-out') : null}
        </>
      ) : null}
      {action.error ? <ErrorState message={errorMessage(action.error)} /> : null}
    </Card>
  );
}
