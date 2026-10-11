import { useEffect, useState } from 'react';
import { Clock, MapPin, Zap } from 'lucide-react-native';
import { View } from 'react-native';
import type { MyOffer } from '@teampilot/shared';
import { AppText, Button, Card, ErrorState } from '@/components/ui';
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

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function OfferCard({ orgId, offer, now }: { orgId: string; offer: MyOffer; now: number }) {
  const { colors, spacing, scale } = useTheme();
  const respond = useRespondToOffer(orgId);
  const total = Date.parse(offer.expiresAt) - Date.parse(offer.offeredAt);
  const left = Date.parse(offer.expiresAt) - now;
  const expired = left <= 0;
  const fraction = Math.max(0, Math.min(1, left / total));
  const barColor = fraction > 0.5 ? scale.high : fraction > 0.2 ? scale.mid : scale.low;
  const meta = (Icon: typeof Clock, text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon size={14} color="#A1A1AA" />
      <AppText variant="caption" style={{ color: '#D4D4D8' }} numberOfLines={1}>{text}</AppText>
    </View>
  );

  return (
    <Card tone="ink" style={{ padding: spacing.xl, gap: spacing.md, opacity: expired ? 0.6 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Zap size={16} color={scale.mid} />
          <AppText variant="label" style={{ color: scale.mid }}>New task offer</AppText>
        </View>
        <AppText variant="heading" style={{ color: colors.inkText, fontVariant: ['tabular-nums'] }} accessibilityLabel={expired ? 'Expired' : `${clock(left)} left`}>
          {expired ? 'Expired' : clock(left)}
        </AppText>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
        <View style={{ width: `${fraction * 100}%`, height: '100%', backgroundColor: barColor }} />
      </View>
      <AppText variant="title" style={{ color: colors.inkText, fontSize: 24, lineHeight: 30 }}>{offer.task.title}</AppText>
      <View style={{ gap: 4 }}>
        {offer.event ? meta(Clock, `${offer.event.title} · ${formatRange(offer.event.startAt, offer.event.endAt, offer.event.timezone)}`) : null}
        {offer.task.estimatedDurationMinutes ? meta(Clock, `About ${offer.task.estimatedDurationMinutes} min`) : null}
        {offer.task.locationName ? meta(MapPin, offer.task.locationName) : null}
      </View>
      {offer.task.instructions ? <AppText variant="caption" style={{ color: '#A1A1AA' }} numberOfLines={2}>{offer.task.instructions}</AppText> : null}
      <AppText variant="caption" style={{ color: '#A1A1AA' }}>First to accept gets the spot.</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Decline"
            variant="onInk"
            disabled={expired || respond.isPending}
            loading={respond.isPending && respond.variables?.action === 'decline'}
            onPress={() => respond.mutate({ id: offer.id, action: 'decline' })}
          />
        </View>
        <View style={{ flex: 2 }}>
          <Button
            label="Accept"
            variant="secondary"
            disabled={expired || respond.isPending}
            loading={respond.isPending && respond.variables?.action === 'accept'}
            onPress={() => respond.mutate({ id: offer.id, action: 'accept' })}
          />
        </View>
      </View>
      {respond.error ? <ErrorState message={errorMessage(respond.error)} /> : null}
    </Card>
  );
}

export function OffersCard({ orgId }: { orgId: string }) {
  const { spacing } = useTheme();
  const offers = useMyOffers(orgId);
  const now = useNow();
  if (!offers.data?.length) return null;
  return (
    <View style={{ gap: spacing.md }}>
      {offers.data.map((o) => <OfferCard key={o.id} orgId={orgId} offer={o} now={now} />)}
    </View>
  );
}
