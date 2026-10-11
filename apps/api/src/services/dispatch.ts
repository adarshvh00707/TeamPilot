import { planWave, taskStateMachine, type DeclineOfferInput, type Task, type TaskStatus } from '@teampilot/shared';
import type { Db, Queryable } from '../db/types';
import { loadMemberSignals } from '../repositories/attendance';
import { writeAudit } from '../repositories/audit';
import {
  cancelRunningRounds,
  countOpenOffersInRound,
  expireDueOffers,
  findSettledRounds,
  finishRound,
  getOffer,
  getRunningRound,
  insertOffers,
  insertRound,
  nextRoundNumber,
  setOfferStatus,
  withdrawOpenOffers,
} from '../repositories/dispatch';
import { getTask, insertAssignment, setAssignmentStatus, setTaskStatus } from '../repositories/tasks';
import { AppError, conflict, notFound } from '../utils/errors';
import { notifyEscalation, notifyOffers } from './notifications';
import { syncStaffing, type Actor } from './work';

const DISPATCHABLE_FROM: readonly TaskStatus[] = ['SCHEDULED', 'PARTIALLY_STAFFED', 'NEEDS_MANAGER_ATTENTION'];
/** Task states in which an open offer may still be accepted. */
const ACCEPTING: readonly TaskStatus[] = ['DISPATCHING', 'PARTIALLY_STAFFED'];

async function moveTask(tx: Queryable, task: Task, to: TaskStatus) {
  if (task.status === to || !taskStateMachine.can(task.status, to)) return task;
  return (await setTaskStatus(tx, task.organizationId, task.id, to))!;
}

async function escalate(tx: Queryable, task: Task, reason: string, actorUserId: string | null, roundNumber: number) {
  await moveTask(tx, task, 'NEEDS_MANAGER_ATTENTION');
  await notifyEscalation(tx, task, reason, `${task.id}:${roundNumber}`);
  await writeAudit(tx, {
    organizationId: task.organizationId,
    actorUserId,
    action: 'task.escalated',
    entityType: 'task',
    entityId: task.id,
    metadata: { reason, staffed: task.staffing.staffed, required: task.requiredHeadcount },
  });
}

/**
 * Plans and sends one wave of offers. The plan, including why members were excluded, is stored on the
 * round so every dispatch decision can be explained afterwards. Escalates when nobody is eligible.
 */
async function runWave(tx: Queryable, task: Task, actorUserId: string | null) {
  const remaining = task.requiredHeadcount - task.staffing.assigned;
  const roundNumber = await nextRoundNumber(tx, task.id);
  const seed = `${task.id}:${roundNumber}`;
  const signals = await loadMemberSignals(tx, task.organizationId, { taskId: task.id });
  const plan = planWave({
    candidates: signals.map((s) => s.candidate),
    requiredSkills: task.requiredSkills,
    remainingPositions: remaining,
    policy: task.dispatchPolicy,
    seed,
  });
  const ineligibleByReason: Record<string, number> = {};
  for (const i of plan.ineligible) ineligibleByReason[i.reason] = (ineligibleByReason[i.reason] ?? 0) + 1;
  const metadata = {
    seed,
    policy: task.dispatchPolicy,
    waveSize: plan.waveSize,
    ineligibleByReason,
    ranked: plan.ranked.slice(0, 25),
  };
  const roundId = await insertRound(tx, {
    organizationId: task.organizationId,
    taskId: task.id,
    roundNumber,
    requiredPositions: remaining,
    eligibleCount: plan.ranked.length,
    selected: plan.selected,
    metadata,
    status: plan.selected.length ? 'RUNNING' : 'FAILED',
  });
  await writeAudit(tx, {
    organizationId: task.organizationId,
    actorUserId,
    action: 'dispatch.wave_started',
    entityType: 'task',
    entityId: task.id,
    metadata: { roundNumber, offered: plan.selected.length, eligible: plan.ranked.length, ineligibleByReason },
  });
  if (!plan.selected.length) {
    await escalate(tx, task, 'NO_ELIGIBLE_CANDIDATES', actorUserId, roundNumber);
    return { roundNumber, offered: 0 };
  }
  const offers = await insertOffers(tx, {
    organizationId: task.organizationId,
    taskId: task.id,
    roundId,
    roundNumber,
    userIds: plan.selected,
    windowMinutes: task.offerResponseWindowMinutes,
  });
  await notifyOffers(tx, task, offers);
  return { roundNumber, offered: plan.selected.length };
}

export async function startDispatch(db: Db, actor: Actor, taskId: string) {
  return db.transaction(async (tx) => {
    let task = await getTask(tx, actor.organizationId, taskId, { forUpdate: true });
    if (!task) throw notFound('Task not found');
    if (await getRunningRound(tx, taskId)) throw conflict('Dispatch is already running for this task');
    if (!DISPATCHABLE_FROM.includes(task.status)) {
      throw conflict(task.status === 'DRAFT' ? 'Schedule the task before dispatching' : `Cannot dispatch a ${task.status.toLowerCase().replace(/_/g, ' ')} task`);
    }
    if (task.staffing.assigned >= task.requiredHeadcount) throw conflict('Task already has enough people assigned');
    task = await moveTask(tx, task, 'DISPATCHING');
    const wave = await runWave(tx, task, actor.actorUserId);
    return { task: (await getTask(tx, actor.organizationId, taskId))!, ...wave };
  });
}

export async function stopDispatch(db: Db, actor: Actor, taskId: string) {
  return db.transaction(async (tx) => {
    const task = await getTask(tx, actor.organizationId, taskId, { forUpdate: true });
    if (!task) throw notFound('Task not found');
    const withdrawn = await withdrawOpenOffers(tx, actor.organizationId, taskId, 'TASK_CHANGED');
    await cancelRunningRounds(tx, taskId);
    if (task.status === 'DISPATCHING') await moveTask(tx, task, 'SCHEDULED');
    const updated = await syncStaffing(tx, actor.organizationId, taskId);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'dispatch.stopped',
      entityType: 'task',
      entityId: taskId,
      metadata: { withdrawnOffers: withdrawn.length },
    });
    return updated;
  });
}

/**
 * Closes the running round once every offer is answered or expired, then sends the next wave or
 * escalates. Safe to call repeatedly: it does nothing while offers are still open.
 */
export async function advanceDispatch(tx: Queryable, organizationId: string, taskId: string) {
  const locked = await getTask(tx, organizationId, taskId, { forUpdate: true });
  if (!locked) return 'missing';
  const round = await getRunningRound(tx, taskId);
  if (!round) return 'idle';
  await expireDueOffers(tx, round.id);
  if ((await countOpenOffersInRound(tx, round.id)) > 0) return 'waiting';
  await finishRound(tx, round.id, 'COMPLETED');

  const task = (await syncStaffing(tx, organizationId, taskId))!;
  if (!ACCEPTING.includes(task.status) || task.staffing.assigned >= task.requiredHeadcount) return 'done';

  if (round.roundNumber >= task.dispatchPolicy.maxWaves) {
    if (task.minimumRequiredHeadcount !== null && task.staffing.staffed >= task.minimumRequiredHeadcount) {
      await writeAudit(tx, {
        organizationId,
        actorUserId: null,
        action: 'dispatch.ended_minimum_met',
        entityType: 'task',
        entityId: taskId,
        metadata: { staffed: task.staffing.staffed, minimum: task.minimumRequiredHeadcount },
      });
      return 'done';
    }
    await escalate(tx, task, 'MAX_WAVES_REACHED', null, round.roundNumber);
    return 'escalated';
  }
  const dispatching = await moveTask(tx, task, 'DISPATCHING');
  const wave = await runWave(tx, dispatching, null);
  return wave.offered ? 'next_wave' : 'escalated';
}

/** Called by the worker on a schedule. Each task advances in its own transaction. */
export async function sweepDispatch(db: Db) {
  const due = await findSettledRounds(db);
  const results: Record<string, number> = {};
  for (const { organizationId, taskId } of due) {
    const outcome = await db.transaction((tx) => advanceDispatch(tx, organizationId, taskId));
    results[outcome] = (results[outcome] ?? 0) + 1;
  }
  return { processed: due.length, results };
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: AppError };

/**
 * Acceptance locks the task row first, so concurrent accepts serialize and capacity is checked against
 * committed state; the losing offers are withdrawn in the same transaction. State changes that explain a
 * refusal (expiry, capacity filled) are committed before the error is returned.
 */
export async function acceptOffer(db: Db, actor: Actor, offerId: string) {
  const outcome = await db.transaction<Outcome<{ assignmentId: string; taskId: string }>>(async (tx) => {
    const peek = await getOffer(tx, actor.organizationId, offerId);
    if (!peek || peek.userId !== actor.actorUserId) return { ok: false, error: notFound('Offer not found') };
    const task = (await getTask(tx, actor.organizationId, peek.taskId, { forUpdate: true }))!;
    const offer = (await getOffer(tx, actor.organizationId, offerId, { forUpdate: true }))!;

    if (offer.status !== 'OFFERED') {
      return { ok: false, error: conflict(`This offer is no longer available (${offer.status.toLowerCase()})`, { status: offer.status }) };
    }
    if (Date.parse(offer.expiresAt) <= Date.now()) {
      await setOfferStatus(tx, offer.id, 'EXPIRED', 'EXPIRED');
      return { ok: false, error: conflict('This offer has expired', { status: 'EXPIRED' }) };
    }
    if (!ACCEPTING.includes(task.status)) {
      await setOfferStatus(tx, offer.id, 'WITHDRAWN', 'TASK_CHANGED');
      return { ok: false, error: conflict('This task is no longer looking for people', { status: 'WITHDRAWN' }) };
    }
    if (task.staffing.assigned >= task.requiredHeadcount) {
      await setOfferStatus(tx, offer.id, 'WITHDRAWN', 'CAPACITY_FILLED');
      return { ok: false, error: conflict('Someone else already filled this spot', { status: 'WITHDRAWN', reason: 'CAPACITY_FILLED' }) };
    }

    const assignment = await insertAssignment(tx, {
      organizationId: actor.organizationId,
      taskId: task.id,
      userId: actor.actorUserId,
      source: 'OFFER',
      overrideReason: null,
      assignedBy: actor.actorUserId,
    });
    await tx.query('update task_assignments set offer_id = $2 where id = $1', [assignment.id, offer.id]);
    await setAssignmentStatus(tx, actor.organizationId, assignment.id, 'ACCEPTED');
    await setOfferStatus(tx, offer.id, 'ACCEPTED', 'ACCEPTED');

    const synced = await syncStaffing(tx, actor.organizationId, task.id);
    if (synced.staffing.assigned >= synced.requiredHeadcount) {
      await withdrawOpenOffers(tx, actor.organizationId, task.id, 'CAPACITY_FILLED');
      const round = await getRunningRound(tx, task.id);
      if (round) await finishRound(tx, round.id, 'COMPLETED');
    }
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'offer.accepted',
      entityType: 'task_offer',
      entityId: offer.id,
      metadata: { taskId: task.id, assignmentId: assignment.id },
    });
    return { ok: true, value: { assignmentId: assignment.id, taskId: task.id } };
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/** A decline that empties the wave moves dispatch on immediately instead of waiting for expiry. */
export async function declineOffer(db: Db, actor: Actor, offerId: string, input: DeclineOfferInput) {
  return db.transaction(async (tx) => {
    const peek = await getOffer(tx, actor.organizationId, offerId);
    if (!peek || peek.userId !== actor.actorUserId) throw notFound('Offer not found');
    await getTask(tx, actor.organizationId, peek.taskId, { forUpdate: true });
    const offer = (await getOffer(tx, actor.organizationId, offerId, { forUpdate: true }))!;
    if (offer.status !== 'OFFERED') throw conflict(`This offer is no longer available (${offer.status.toLowerCase()})`);
    await setOfferStatus(tx, offer.id, 'DECLINED', input.reason);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'offer.declined',
      entityType: 'task_offer',
      entityId: offer.id,
      metadata: { taskId: offer.taskId, reason: input.reason },
    });
    await advanceDispatch(tx, actor.organizationId, offer.taskId);
    return (await getOffer(tx, actor.organizationId, offerId))!;
  });
}
