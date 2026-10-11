import {
  assignmentStateMachine,
  eventStateMachine,
  hasRoleAtLeast,
  taskStateMachine,
  type AssignmentStatus,
  type CreateAssignmentInput,
  type CreateEventInput,
  type CreateTaskInput,
  type EventStatus,
  type Role,
  type Task,
  type TaskStatus,
  type UpdateEventInput,
  type UpdateTaskInput,
} from '@teampilot/shared';
import type { Db, Queryable } from '../db/types';
import { writeAudit } from '../repositories/audit';
import { cancelRunningRounds, withdrawOpenOffers } from '../repositories/dispatch';
import { getEvent, insertEvent, setEventStatus, updateEvent } from '../repositories/events';
import { getLocation } from '../repositories/locations';
import { findActiveMembership } from '../repositories/memberships';
import {
  cancelLiveAssignments,
  getAssignment,
  getTask,
  insertAssignment,
  insertTask,
  listOpenTaskIdsForEvent,
  setAssignmentStatus,
  setTaskStatus,
  updateTaskFields,
} from '../repositories/tasks';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { notifyAssignment } from './notifications';

export interface Actor {
  organizationId: string;
  actorUserId: string;
  actorRole: Role;
}

const TERMINAL_TASK: readonly TaskStatus[] = ['COMPLETED', 'CANCELLED'];
/** Task states in which people can be assigned. */
const ASSIGNABLE_TASK: readonly TaskStatus[] = [
  'SCHEDULED',
  'DISPATCHING',
  'PARTIALLY_STAFFED',
  'FULLY_STAFFED',
  'IN_PROGRESS',
  'NEEDS_MANAGER_ATTENTION',
];

async function assertLocation(tx: Queryable, organizationId: string, locationId: string | null | undefined) {
  if (!locationId) return;
  const loc = await getLocation(tx, organizationId, locationId);
  if (!loc || loc.archivedAt) throw badRequest('Location not found or archived');
}

async function assertMember(tx: Queryable, organizationId: string, userId: string | null | undefined, label: string) {
  if (!userId) return;
  if (!(await findActiveMembership(tx, organizationId, userId))) throw badRequest(`${label} is not an active member`);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEvent(db: Db, actor: Actor, input: CreateEventInput) {
  return db.transaction(async (tx) => {
    await assertLocation(tx, actor.organizationId, input.locationId);
    const event = await insertEvent(tx, { organizationId: actor.organizationId, createdBy: actor.actorUserId, ...input });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'event.created',
      entityType: 'event',
      entityId: event.id,
    });
    return event;
  });
}

export async function editEvent(db: Db, actor: Actor, eventId: string, input: UpdateEventInput) {
  return db.transaction(async (tx) => {
    const current = await getEvent(tx, actor.organizationId, eventId, { forUpdate: true });
    if (!current) throw notFound('Event not found');
    if (eventStateMachine.isTerminal(current.status)) throw conflict(`A ${current.status.toLowerCase()} event cannot be edited`);
    const startAt = input.startAt ?? current.startAt;
    const endAt = input.endAt ?? current.endAt;
    if (Date.parse(endAt) <= Date.parse(startAt)) throw badRequest('End must be after start');
    await assertLocation(tx, actor.organizationId, input.locationId);
    const updated = (await updateEvent(tx, actor.organizationId, eventId, input))!;
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'event.updated',
      entityType: 'event',
      entityId: eventId,
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  });
}

/** Cancelling an event cancels its open tasks and their live assignments in the same transaction. */
export async function transitionEvent(db: Db, actor: Actor, eventId: string, to: EventStatus) {
  return db.transaction(async (tx) => {
    const current = await getEvent(tx, actor.organizationId, eventId, { forUpdate: true });
    if (!current) throw notFound('Event not found');
    eventStateMachine.assert(current.status, to);
    let cancelledTasks = 0;
    if (to === 'CANCELLED') {
      for (const t of await listOpenTaskIdsForEvent(tx, actor.organizationId, eventId)) {
        await withdrawOpenOffers(tx, actor.organizationId, t.id, 'TASK_CANCELLED');
        await cancelRunningRounds(tx, t.id);
        await cancelLiveAssignments(tx, actor.organizationId, t.id);
        await setTaskStatus(tx, actor.organizationId, t.id, 'CANCELLED');
        cancelledTasks++;
      }
    }
    const updated = (await setEventStatus(tx, actor.organizationId, eventId, to))!;
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'event.status_changed',
      entityType: 'event',
      entityId: eventId,
      metadata: { from: current.status, to, cancelledTasks },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

async function assertEvent(tx: Queryable, organizationId: string, eventId: string | null | undefined) {
  if (!eventId) return;
  const event = await getEvent(tx, organizationId, eventId);
  if (!event) throw badRequest('Event not found');
  if (eventStateMachine.isTerminal(event.status)) throw badRequest(`Cannot attach tasks to a ${event.status.toLowerCase()} event`);
}

export async function createTask(db: Db, actor: Actor, input: CreateTaskInput) {
  return db.transaction(async (tx) => {
    await assertEvent(tx, actor.organizationId, input.eventId);
    await assertLocation(tx, actor.organizationId, input.locationId);
    await assertMember(tx, actor.organizationId, input.ownerUserId, 'Owner');
    const task = await insertTask(tx, { organizationId: actor.organizationId, createdBy: actor.actorUserId, ...input });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'task.created',
      entityType: 'task',
      entityId: task.id,
    });
    return task;
  });
}

function assertVersion(task: Task, expected: number | undefined) {
  if (expected !== undefined && expected !== task.version) {
    throw conflict('This task was changed by someone else. Reload and try again.', { currentVersion: task.version });
  }
}

/**
 * Derives the staffing state from assignments. Only touches tasks in a staffing-related state, and only
 * moves along transitions the state machine allows.
 */
export async function syncStaffing(tx: Queryable, organizationId: string, taskId: string) {
  const task = (await getTask(tx, organizationId, taskId))!;
  if (!['SCHEDULED', 'DISPATCHING', 'PARTIALLY_STAFFED', 'FULLY_STAFFED'].includes(task.status)) return task;
  const { staffed } = task.staffing;
  let target: TaskStatus;
  if (staffed >= task.requiredHeadcount) target = 'FULLY_STAFFED';
  else if (staffed > 0) target = 'PARTIALLY_STAFFED';
  else target = task.status === 'DISPATCHING' ? 'DISPATCHING' : 'SCHEDULED';
  if (target === task.status || !taskStateMachine.can(task.status, target)) return task;
  return (await setTaskStatus(tx, organizationId, taskId, target))!;
}

export async function editTask(db: Db, actor: Actor, taskId: string, input: UpdateTaskInput) {
  const { expectedVersion, ...patch } = input;
  return db.transaction(async (tx) => {
    const current = await getTask(tx, actor.organizationId, taskId, { forUpdate: true });
    if (!current) throw notFound('Task not found');
    assertVersion(current, expectedVersion);
    if (TERMINAL_TASK.includes(current.status)) throw conflict(`A ${current.status.toLowerCase()} task cannot be edited`);
    const required = patch.requiredHeadcount ?? current.requiredHeadcount;
    const minimum = patch.minimumRequiredHeadcount === undefined ? current.minimumRequiredHeadcount : patch.minimumRequiredHeadcount;
    if (minimum !== null && minimum > required) throw badRequest('Minimum headcount cannot exceed required headcount');
    await assertEvent(tx, actor.organizationId, patch.eventId);
    await assertLocation(tx, actor.organizationId, patch.locationId);
    await assertMember(tx, actor.organizationId, patch.ownerUserId, 'Owner');
    await updateTaskFields(tx, actor.organizationId, taskId, patch);
    const updated = await syncStaffing(tx, actor.organizationId, taskId);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'task.updated',
      entityType: 'task',
      entityId: taskId,
      metadata: { fields: Object.keys(patch) },
    });
    return updated;
  });
}

export async function transitionTask(db: Db, actor: Actor, taskId: string, to: TaskStatus, expectedVersion?: number) {
  return db.transaction(async (tx) => {
    const current = await getTask(tx, actor.organizationId, taskId, { forUpdate: true });
    if (!current) throw notFound('Task not found');
    assertVersion(current, expectedVersion);
    if (to === 'SCHEDULED' && current.status === 'DRAFT' && current.eventId) {
      const event = await getEvent(tx, actor.organizationId, current.eventId);
      if (event?.status === 'DRAFT') throw conflict('Publish the event before scheduling its tasks');
    }
    taskStateMachine.assert(current.status, to);
    if (to === 'DRAFT' && current.staffing.assigned > 0) throw conflict('Remove assignments before moving the task back to draft');
    if (to !== 'IN_PROGRESS') {
      await withdrawOpenOffers(tx, actor.organizationId, taskId, to === 'CANCELLED' ? 'TASK_CANCELLED' : 'TASK_CHANGED');
      await cancelRunningRounds(tx, taskId);
    }
    if (to === 'CANCELLED') await cancelLiveAssignments(tx, actor.organizationId, taskId);
    let updated = (await setTaskStatus(tx, actor.organizationId, taskId, to))!;
    if (to === 'SCHEDULED') updated = await syncStaffing(tx, actor.organizationId, taskId);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: 'task.status_changed',
      entityType: 'task',
      entityId: taskId,
      metadata: { from: current.status, to: updated.status },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/**
 * The task row is locked so concurrent assignments are serialized and capacity is checked against committed
 * state. Assigning beyond the required headcount requires an explicit, audited override reason.
 */
export async function assignMember(db: Db, actor: Actor, taskId: string, input: CreateAssignmentInput) {
  return db.transaction(async (tx) => {
    const task = await getTask(tx, actor.organizationId, taskId, { forUpdate: true });
    if (!task) throw notFound('Task not found');
    if (!ASSIGNABLE_TASK.includes(task.status)) {
      throw conflict(task.status === 'DRAFT' ? 'Schedule the task before assigning people' : `Cannot assign people to a ${task.status.toLowerCase()} task`);
    }
    await assertMember(tx, actor.organizationId, input.userId, 'Assignee');
    const overCapacity = task.staffing.assigned >= task.requiredHeadcount;
    if (overCapacity && !input.overrideReason) {
      throw conflict('Task is already at its required headcount. Provide an override reason to assign more people.', {
        requiredHeadcount: task.requiredHeadcount,
        assigned: task.staffing.assigned,
      });
    }
    const assignment = await insertAssignment(tx, {
      organizationId: actor.organizationId,
      taskId,
      userId: input.userId,
      source: overCapacity ? 'MANAGER_OVERRIDE' : 'MANAGER',
      overrideReason: overCapacity ? input.overrideReason! : null,
      assignedBy: actor.actorUserId,
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: overCapacity ? 'task.assigned_override' : 'task.assigned',
      entityType: 'task_assignment',
      entityId: assignment.id,
      metadata: { taskId, userId: input.userId, ...(overCapacity ? { overrideReason: input.overrideReason } : {}) },
    });
    if (input.userId !== actor.actorUserId) await notifyAssignment(tx, task, input.userId, assignment.id);
    return assignment;
  });
}

type AssignmentAction = 'accept' | 'decline' | 'start' | 'complete' | 'cancel';

const ACTION_TARGET: Record<AssignmentAction, AssignmentStatus> = {
  accept: 'ACCEPTED',
  decline: 'CANCELLED',
  start: 'IN_PROGRESS',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
};

const ACTION_AUDIT: Record<AssignmentAction, string> = {
  accept: 'accepted',
  decline: 'declined',
  start: 'started',
  complete: 'completed',
  cancel: 'cancelled',
};

/**
 * accept / decline / start / complete are performed by the assignee; cancel by a manager.
 * Starting work moves a staffed task to IN_PROGRESS.
 */
export async function actOnAssignment(db: Db, actor: Actor, assignmentId: string, action: AssignmentAction) {
  return db.transaction(async (tx) => {
    const current = await getAssignment(tx, actor.organizationId, assignmentId, { forUpdate: true });
    if (!current) throw notFound('Assignment not found');
    const isAssignee = current.userId === actor.actorUserId;
    const isManager = hasRoleAtLeast(actor.actorRole, 'MANAGER');
    if (action === 'cancel' ? !isManager : !isAssignee) {
      // Do not reveal other people's assignments to staff.
      if (!isManager) throw notFound('Assignment not found');
      throw forbidden(action === 'cancel' ? undefined : 'Only the assigned person can do this');
    }
    if (action === 'decline' && current.status !== 'ASSIGNED') throw conflict('Only pending assignments can be declined');

    const task = (await getTask(tx, actor.organizationId, current.taskId, { forUpdate: true }))!;
    if (action !== 'cancel' && TERMINAL_TASK.includes(task.status)) throw conflict(`This task is ${task.status.toLowerCase()}`);

    const to = ACTION_TARGET[action];
    assignmentStateMachine.assert(current.status, to);
    const updated = await setAssignmentStatus(tx, actor.organizationId, assignmentId, to);

    const synced = await syncStaffing(tx, actor.organizationId, current.taskId);
    if (action === 'start' && taskStateMachine.can(synced.status, 'IN_PROGRESS')) {
      await setTaskStatus(tx, actor.organizationId, current.taskId, 'IN_PROGRESS');
    }
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action: `assignment.${ACTION_AUDIT[action]}`,
      entityType: 'task_assignment',
      entityId: assignmentId,
      metadata: { taskId: current.taskId, from: current.status, to },
    });
    return updated;
  });
}
