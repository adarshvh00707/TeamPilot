import type { JobsOptions } from 'bullmq';

/** Queue names. Each queue has a dedicated processor; processors arrive with their phase. */
export const QUEUES = {
  dispatch: 'dispatch',
  offers: 'offers',
  notifications: 'notifications',
  attendance: 'attendance',
  documents: 'documents',
  webhooks: 'webhooks',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * Deterministic job ids make enqueueing idempotent: BullMQ ignores an add() whose id already exists.
 * Example: jobId('dispatch-wave', taskId, 2, taskVersion). Including the task version means an
 * edited task gets fresh jobs while stale ones are skipped when their processor rereads state.
 */
export function jobId(kind: string, ...parts: Array<string | number>): string {
  const safe = [kind, ...parts].map((p) => String(p).replace(/[^A-Za-z0-9_-]/g, '_'));
  return safe.join('__');
}

/** Exponential backoff with full jitter, capped. */
export function backoffWithJitter(attempt: number, baseMs = 2_000, capMs = 5 * 60_000, rand: () => number = Math.random) {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(rand() * exp);
}
