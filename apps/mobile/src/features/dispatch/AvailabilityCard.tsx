import { Coffee, LogIn, LogOut, PauseCircle, PlayCircle } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { MyAvailability } from '@teampilot/shared';
import { AppText, Card, ErrorState, Skeleton } from '@/components/ui';
import { formatTime, humanize } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { useAvailabilityAction, useMyAvailability, type AvailabilityAction } from './api';

export const availabilityTone = (s: MyAvailability['status']) =>
  s === 'AVAILABLE' ? 'success' : s === 'OFF_SHIFT' || s === 'UNKNOWN' ? 'neutral' : 'warning';

/** Clock-ins here are self-reported, so they are always labelled as unverified. */
export const verificationLabel = (v: MyAvailability['verification']) =>
  v === 'VERIFIED' ? 'Verified' : v === 'MANUAL' ? 'Unverified (manual)' : humanize(v);

const DOT = { success: '#5BCB7A', warning: '#F5B85A', neutral: '#71717A' } as const;

export function AvailabilityCard({ orgId }: { orgId: string }) {
  const { colors, spacing, radius } = useTheme();
  const availability = useMyAvailability(orgId);
  const action = useAvailabilityAction(orgId);
  const a = availability.data;

  const pill = (label: string, act: AvailabilityAction, Icon: typeof Coffee, primary = false, body?: object) => (
    <Pressable
      key={act}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={action.isPending}
      onPress={() => action.mutate({ action: act, body })}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 46,
        borderRadius: radius.pill,
        backgroundColor: primary ? colors.surface : 'rgba(255,255,255,0.1)',
        opacity: action.isPending && action.variables?.action === act ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Icon size={18} color={primary ? colors.ink : colors.inkText} />
      <AppText variant="label" style={{ color: primary ? colors.ink : colors.inkText }}>{label}</AppText>
    </Pressable>
  );

  return (
    <Card tone="ink" style={{ gap: spacing.md, padding: spacing.xl }}>
      {availability.isPending ? <Skeleton height={60} /> : null}
      {availability.error ? <ErrorState message={errorMessage(availability.error)} onRetry={() => void availability.refetch()} /> : null}
      {a ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DOT[availabilityTone(a.status)] }} />
            <AppText variant="caption" style={{ color: '#A1A1AA' }}>
              {a.clockedInAt ? `On shift since ${formatTime(a.clockedInAt)} · ${verificationLabel(a.verification)}` : 'Off shift'}
            </AppText>
          </View>
          <AppText variant="display" style={{ color: colors.inkText }}>
            {a.activeBreak ? 'On break' : a.paused ? 'Paused' : humanize(a.status)}
          </AppText>
          <AppText variant="caption" style={{ color: '#A1A1AA' }}>
            {a.activeBreak
              ? `Back at ${formatTime(a.activeBreak.expectedEndAt)}. You won't get offers until then.`
              : a.paused
                ? 'You will not receive new task offers.'
                : a.clockedInAt
                  ? 'You can receive task offers.'
                  : 'Clock in to start receiving task offers.'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {!a.clockedInAt
              ? pill('Clock in', 'clock-in', LogIn, true)
              : [
                  a.activeBreak ? pill('End break', 'breaks/end', PlayCircle, true) : pill('Break', 'breaks/start', Coffee, false, { minutes: 15 }),
                  a.paused ? pill('Resume', 'resume', PlayCircle, true) : pill('Pause', 'pause', PauseCircle),
                  pill('Clock out', 'clock-out', LogOut),
                ]}
          </View>
        </>
      ) : null}
      {action.error ? <ErrorState message={errorMessage(action.error)} /> : null}
    </Card>
  );
}
