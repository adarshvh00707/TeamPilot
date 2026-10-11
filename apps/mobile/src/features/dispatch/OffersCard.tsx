import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { MyOffer } from '@teampilot/shared';
import { AppText, Badge, Button, Card, ErrorState } from '@/components/ui';
import { formatRange } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { useMyOffers, useRespondToOffer } from './api';

function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const remaining = (expiresAt: string, now: number) => {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function OfferRow({ orgId, offer, now }: { orgId: string; offer: MyOffer; now: number }) {
  const { spacing } = useTheme();
  const respond = useRespondToOffer(orgId);
  const expired = Date.parse(offer.expiresAt) <= now;
  return (
    <View style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="label" style={{ flex: 1 }}>{offer.task.title}</AppText>
        <Badge label={expired ? 'Expired' : remaining(offer.expiresAt, now)} tone={expired ? 'neutral' : 'warning'} />
      </View>
      {offer.event ? <AppText tone="muted">{offer.event.title} · {formatRange(offer.event.startAt, offer.event.endAt, offer.event.timezone)}</AppText> : null}
      {offer.task.locationName ? <AppText tone="muted">{offer.task.locationName}</AppText> : null}
      {offer.task.estimatedDurationMinutes ? <AppText tone="muted">About {offer.task.estimatedDurationMinutes} min</AppText> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(['accept', 'decline'] as const).map((action) => (
          <View key={action} style={{ flex: 1 }}>
            <Button
              label={action === 'accept' ? 'Accept' : 'Decline'}
              variant={action === 'accept' ? 'primary' : 'secondary'}
              disabled={expired || respond.isPending}
              loading={respond.isPending && respond.variables?.action === action}
              onPress={() => respond.mutate({ id: offer.id, action })}
            />
          </View>
        ))}
      </View>
      {respond.error ? <ErrorState message={errorMessage(respond.error)} /> : null}
    </View>
  );
}

export function OffersCard({ orgId }: { orgId: string }) {
  const offers = useMyOffers(orgId);
  const now = useNow();
  if (!offers.data?.length) return null;
  return (
    <Card>
      <AppText variant="heading">Task offers</AppText>
      <AppText tone="muted">First to accept gets the spot.</AppText>
      {offers.data.map((o) => <OfferRow key={o.id} orgId={orgId} offer={o} now={now} />)}
    </Card>
  );
}
