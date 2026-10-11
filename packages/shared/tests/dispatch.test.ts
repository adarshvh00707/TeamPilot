import { describe, expect, it } from 'vitest';
import {
  deriveAvailability,
  parseDispatchPolicy,
  planWave,
  seededTieBreak,
  workloadScore,
  type DispatchCandidate,
} from '../src';

const policy = parseDispatchPolicy({});
const idle = { recentMinutes: 0, acceptedToday: 0, highPriorityRecent: 0 };

const cand = (userId: string, over: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  userId,
  role: 'STAFF',
  availability: 'AVAILABLE',
  skills: [],
  hasOpenOffer: false,
  alreadyOfferedThisTask: false,
  liveOnThisTask: false,
  hasConflict: false,
  workload: idle,
  ...over,
});

describe('deriveAvailability', () => {
  const base = { onBreak: false, paused: false, openAttendance: 'MANUAL' as const, working: false, hasOpenOffer: false };

  it('treats nobody as present without an attendance record', () => {
    expect(deriveAvailability({ ...base, openAttendance: null })).toEqual({ status: 'OFF_SHIFT', verification: 'UNKNOWN' });
  });

  it('applies break, pause, work, and pending offer in priority order', () => {
    expect(deriveAvailability({ ...base, onBreak: true, paused: true }).status).toBe('ON_BREAK');
    expect(deriveAvailability({ ...base, paused: true, working: true }).status).toBe('UNAVAILABLE');
    expect(deriveAvailability({ ...base, working: true, hasOpenOffer: true }).status).toBe('WORKING');
    expect(deriveAvailability({ ...base, hasOpenOffer: true }).status).toBe('PENDING_ACCEPTANCE');
    expect(deriveAvailability(base)).toEqual({ status: 'AVAILABLE', verification: 'MANUAL' });
  });
});

describe('dispatch policy', () => {
  it('falls back to defaults for invalid input', () => {
    expect(parseDispatchPolicy({ maxWaves: 99 })).toEqual(parseDispatchPolicy({}));
    expect(parseDispatchPolicy({ maxWaves: 2 }).maxWaves).toBe(2);
  });
});

describe('planWave', () => {
  it('filters ineligible candidates with a reason', () => {
    const plan = planWave({
      candidates: [
        cand('mgr', { role: 'MANAGER' }),
        cand('assigned', { liveOnThisTask: true }),
        cand('offered', { alreadyOfferedThisTask: true }),
        cand('pending', { hasOpenOffer: true, availability: 'PENDING_ACCEPTANCE' }),
        cand('break', { availability: 'ON_BREAK' }),
        cand('off', { availability: 'OFF_SHIFT' }),
        cand('noskill', { skills: ['bar'] }),
        cand('busy', { skills: ['av'], hasConflict: true }),
        cand('ok', { skills: ['av'] }),
      ],
      requiredSkills: ['av'],
      remainingPositions: 1,
      policy,
      seed: 's',
    });
    expect(plan.selected).toEqual(['ok']);
    expect(Object.fromEntries(plan.ineligible.map((i) => [i.userId, i.reason]))).toEqual({
      mgr: 'ROLE_EXCLUDED',
      assigned: 'ALREADY_ASSIGNED',
      offered: 'ALREADY_OFFERED',
      pending: 'PENDING_OFFER',
      break: 'NOT_AVAILABLE',
      off: 'NOT_AVAILABLE',
      noskill: 'MISSING_SKILL',
      busy: 'SCHEDULE_CONFLICT',
    });
  });

  it('includes managers only when the policy allows it', () => {
    const plan = planWave({ candidates: [cand('mgr', { role: 'MANAGER' })], requiredSkills: [], remainingPositions: 1, policy: { ...policy, includeManagers: true }, seed: 's' });
    expect(plan.selected).toEqual(['mgr']);
  });

  it('prefers the lightest recent workload', () => {
    const plan = planWave({
      candidates: [
        cand('heavy', { workload: { recentMinutes: 240, acceptedToday: 3, highPriorityRecent: 1 } }),
        cand('light', { workload: { recentMinutes: 30, acceptedToday: 1, highPriorityRecent: 0 } }),
        cand('fresh'),
      ],
      requiredSkills: [],
      remainingPositions: 2,
      policy: { ...policy, overOfferFactor: 1 },
      seed: 's',
    });
    expect(plan.selected).toEqual(['fresh', 'light']);
    expect(workloadScore({ recentMinutes: 30, acceptedToday: 1, highPriorityRecent: 1 })).toBe(80);
  });

  it('breaks ties deterministically from the seed', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => cand(id));
    const run = (seed: string) => planWave({ candidates, requiredSkills: [], remainingPositions: 6, policy: { ...policy, overOfferFactor: 1 }, seed }).selected;
    expect(run('task-1:1')).toEqual(run('task-1:1'));
    expect(new Set([run('task-1:1').join(), run('task-1:2').join(), run('task-2:1').join()]).size).toBeGreaterThan(1);
    expect(seededTieBreak('x', 'y')).toBe(seededTieBreak('x', 'y'));
  });

  it('sizes waves by remaining positions, over-offer factor, and cap', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => cand(`u${i}`));
    const size = (remaining: number, over: Partial<typeof policy> = {}) =>
      planWave({ candidates, requiredSkills: [], remainingPositions: remaining, policy: { ...policy, ...over }, seed: 's' }).selected.length;
    expect(size(2)).toBe(3);
    expect(size(2, { overOfferFactor: 1 })).toBe(2);
    expect(size(20)).toBe(10);
    expect(size(0)).toBe(0);
  });
});
