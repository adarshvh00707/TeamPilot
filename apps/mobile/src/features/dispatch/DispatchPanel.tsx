import { View } from 'react-native';
import type { TaskDetail, TaskStatus } from '@teampilot/shared';
import { AppText, Badge, Button, Card, ErrorState } from '@/components/ui';
import { formatTime, humanize } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { useDispatchControl } from './api';

const STARTABLE: TaskStatus[] = ['SCHEDULED', 'PARTIALLY_STAFFED', 'NEEDS_MANAGER_ATTENTION'];
const offerTone = (s: string) => (s === 'ACCEPTED' ? 'success' : s === 'OFFERED' ? 'warning' : 'neutral');

export function DispatchPanel({ orgId, task }: { orgId: string; task: TaskDetail }) {
  const { spacing } = useTheme();
  const control = useDispatchControl(orgId, task.id);
  const d = task.dispatch;
  if (!d) return null;
  const running = d.rounds.some((r) => r.status === 'RUNNING');
  const canStart = !running && STARTABLE.includes(task.status) && task.staffing.assigned < task.requiredHeadcount;
  if (!running && !canStart && !d.rounds.length) return null;

  return (
    <Card>
      <AppText variant="heading">Automatic dispatch</AppText>
      <AppText tone="muted">
        Offers go to available staff in waves of up to {d.policy.maxOffersPerWave}, ranked by workload. Up to {d.policy.maxWaves} waves, then a
        manager is alerted.
      </AppText>
      {canStart ? (
        <Button label={d.rounds.length ? 'Dispatch again' : 'Start dispatch'} loading={control.isPending} onPress={() => control.mutate('start')} />
      ) : null}
      {running ? <Button label="Stop dispatch" variant="secondary" loading={control.isPending} onPress={() => control.mutate('stop')} /> : null}
      {control.error ? <ErrorState message={errorMessage(control.error)} /> : null}

      {d.rounds.map((r) => (
        <View key={r.id} style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="label">Wave {r.roundNumber} · {formatTime(r.startedAt)}</AppText>
            <Badge label={humanize(r.status)} tone={r.status === 'FAILED' ? 'danger' : r.status === 'RUNNING' ? 'info' : 'neutral'} />
          </View>
          <AppText variant="caption" tone="muted">
            Offered {r.selectedCount} of {r.eligibleCandidatesCount} eligible
            {Object.keys(r.ineligibleByReason).length
              ? ` · skipped: ${Object.entries(r.ineligibleByReason).map(([k, n]) => `${n} ${humanize(k).toLowerCase()}`).join(', ')}`
              : ''}
          </AppText>
          {d.offers
            .filter((o) => o.roundNumber === r.roundNumber)
            .map((o) => (
              <View key={o.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText style={{ flex: 1 }}>{o.displayName ?? 'Unnamed member'}</AppText>
                <Badge label={humanize(o.status)} tone={offerTone(o.status)} />
              </View>
            ))}
        </View>
      ))}
    </Card>
  );
}
