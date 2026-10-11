import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  TASK_STATUSES,
  TASK_TRANSITIONS,
  assignmentStateMachine,
  hasRoleAtLeast,
  offerStateMachine,
  taskStateMachine,
} from '../src';
import { createOrganizationSchema, isValidTimeZone, updateProfileSchema } from '../src/schemas';

describe('task state machine', () => {
  it('allows the normal staffing lifecycle', () => {
    const path = ['DRAFT', 'SCHEDULED', 'DISPATCHING', 'PARTIALLY_STAFFED', 'FULLY_STAFFED', 'IN_PROGRESS', 'COMPLETED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(taskStateMachine.can(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('never allows leaving terminal states', () => {
    for (const to of TASK_STATUSES) {
      expect(taskStateMachine.can('COMPLETED', to)).toBe(false);
      expect(taskStateMachine.can('CANCELLED', to)).toBe(false);
    }
  });

  it('does not allow a draft to jump straight to fully staffed', () => {
    expect(() => taskStateMachine.assert('DRAFT', 'FULLY_STAFFED')).toThrow(InvalidTransitionError);
  });

  it('only references known states', () => {
    for (const [from, targets] of Object.entries(TASK_TRANSITIONS)) {
      expect(TASK_STATUSES).toContain(from);
      for (const t of targets) expect(TASK_STATUSES).toContain(t);
    }
  });
});

describe('offer and assignment state machines', () => {
  it('offers resolve exactly once', () => {
    expect(offerStateMachine.can('OFFERED', 'ACCEPTED')).toBe(true);
    expect(offerStateMachine.can('ACCEPTED', 'DECLINED')).toBe(false);
    expect(offerStateMachine.can('EXPIRED', 'ACCEPTED')).toBe(false);
  });

  it('completed assignments are terminal', () => {
    expect(assignmentStateMachine.isTerminal('COMPLETED')).toBe(true);
    expect(assignmentStateMachine.can('ACCEPTED', 'IN_PROGRESS')).toBe(true);
  });
});

describe('roles', () => {
  it('ranks roles', () => {
    expect(hasRoleAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(hasRoleAtLeast('STAFF', 'MANAGER')).toBe(false);
    expect(hasRoleAtLeast('MANAGER', 'MANAGER')).toBe(true);
  });
});

describe('schemas', () => {
  it('validates IANA timezones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: 'Acme', timezone: 'Mars/Base' }).success).toBe(false);
  });

  it('rejects role changes through profile updates', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'A', role: 'OWNER' }).success).toBe(false);
  });
});
