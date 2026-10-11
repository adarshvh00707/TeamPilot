import type { AssignmentStatus, EventStatus, OfferStatus, TaskStatus } from './constants/domain';

type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export const EVENT_TRANSITIONS: TransitionMap<EventStatus> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DRAFT'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const TASK_TRANSITIONS: TransitionMap<TaskStatus> = {
  DRAFT: ['SCHEDULED', 'DISPATCHING', 'CANCELLED'],
  SCHEDULED: ['DISPATCHING', 'DRAFT', 'CANCELLED', 'NEEDS_MANAGER_ATTENTION'],
  DISPATCHING: ['PARTIALLY_STAFFED', 'FULLY_STAFFED', 'NEEDS_MANAGER_ATTENTION', 'SCHEDULED', 'CANCELLED'],
  PARTIALLY_STAFFED: ['DISPATCHING', 'FULLY_STAFFED', 'IN_PROGRESS', 'NEEDS_MANAGER_ATTENTION', 'CANCELLED'],
  FULLY_STAFFED: ['PARTIALLY_STAFFED', 'IN_PROGRESS', 'NEEDS_MANAGER_ATTENTION', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'PARTIALLY_STAFFED', 'NEEDS_MANAGER_ATTENTION', 'CANCELLED'],
  NEEDS_MANAGER_ATTENTION: ['DISPATCHING', 'PARTIALLY_STAFFED', 'FULLY_STAFFED', 'IN_PROGRESS', 'SCHEDULED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const OFFER_TRANSITIONS: TransitionMap<OfferStatus> = {
  OFFERED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

export const ASSIGNMENT_TRANSITIONS: TransitionMap<AssignmentStatus> = {
  ASSIGNED: ['ACCEPTED', 'CANCELLED', 'REASSIGNMENT_REQUIRED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED', 'REASSIGNMENT_REQUIRED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'REASSIGNMENT_REQUIRED'],
  REASSIGNMENT_REQUIRED: ['CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid ${entity} transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

function makeGuard<S extends string>(entity: string, map: TransitionMap<S>) {
  return {
    can(from: S, to: S): boolean {
      return map[from].includes(to);
    },
    assert(from: S, to: S): void {
      if (!map[from].includes(to)) throw new InvalidTransitionError(entity, from, to);
    },
    isTerminal(state: S): boolean {
      return map[state].length === 0;
    },
  };
}

export const eventStateMachine = makeGuard('event', EVENT_TRANSITIONS);
export const taskStateMachine = makeGuard('task', TASK_TRANSITIONS);
export const offerStateMachine = makeGuard('offer', OFFER_TRANSITIONS);
export const assignmentStateMachine = makeGuard('assignment', ASSIGNMENT_TRANSITIONS);

/** Assignment states that occupy a staffing position. */
export const STAFFING_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
