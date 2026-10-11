import type { Db, Queryable } from '../db/types';
import {
  closeAttendance,
  endBreak,
  endPause,
  getOpenAttendance,
  insertBreak,
  insertClockIn,
  loadMemberSignals,
  startPause,
} from '../repositories/attendance';
import { writeAudit } from '../repositories/audit';
import { conflict } from '../utils/errors';
import type { Actor } from './work';

/**
 * Attendance sources. Only the manual provider exists today; Sling (Phase 6) will implement the same
 * contract and mark its records VERIFIED. Self-reported data is never presented as verified.
 */
export interface AttendanceProvider {
  readonly source: 'MANUAL' | 'SLING';
  clockIn(tx: Queryable, organizationId: string, userId: string): Promise<void>;
  clockOut(tx: Queryable, organizationId: string, userId: string): Promise<void>;
}

export const manualAttendanceProvider: AttendanceProvider = {
  source: 'MANUAL',
  clockIn: insertClockIn,
  clockOut: closeAttendance,
};

export async function getMyAvailability(db: Queryable, organizationId: string, userId: string) {
  const [me] = await loadMemberSignals(db, organizationId, { userId });
  return me!.availability;
}

type AvailabilityAction = 'clock_in' | 'clock_out' | 'pause' | 'resume' | 'break_start' | 'break_end';

export async function changeMyAvailability(
  db: Db,
  actor: Actor,
  action: AvailabilityAction,
  opts: { minutes?: number; reason?: string } = {},
  provider: AttendanceProvider = manualAttendanceProvider,
) {
  return db.transaction(async (tx) => {
    const { organizationId, actorUserId: userId } = actor;
    const open = await getOpenAttendance(tx, organizationId, userId);
    switch (action) {
      case 'clock_in':
        if (open) throw conflict('You are already clocked in');
        await provider.clockIn(tx, organizationId, userId);
        break;
      case 'clock_out':
        if (!open) throw conflict('You are not clocked in');
        await provider.clockOut(tx, organizationId, userId);
        break;
      case 'pause':
        if (!open) throw conflict('Clock in first');
        await startPause(tx, organizationId, userId, opts.reason ?? null);
        break;
      case 'resume':
        await endPause(tx, organizationId, userId);
        break;
      case 'break_start': {
        if (!open) throw conflict('Clock in before starting a break');
        const [me] = await loadMemberSignals(tx, organizationId, { userId });
        if (me!.availability.activeBreak) throw conflict('You are already on a break');
        await insertBreak(tx, organizationId, userId, opts.minutes ?? 15);
        break;
      }
      case 'break_end':
        if (!(await endBreak(tx, organizationId, userId))) throw conflict('You are not on a break');
        break;
    }
    await writeAudit(tx, {
      organizationId,
      actorUserId: userId,
      action: `availability.${action}`,
      entityType: 'membership',
      entityId: userId,
      metadata: { source: provider.source, ...(opts.minutes ? { minutes: opts.minutes } : {}) },
    });
    return getMyAvailability(tx, organizationId, userId);
  });
}
