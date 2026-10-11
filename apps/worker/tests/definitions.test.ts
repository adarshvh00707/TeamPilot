import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config';
import { backoffWithJitter, jobId } from '../src/queues/definitions';

describe('jobId', () => {
  it('is deterministic and safe for Redis keys', () => {
    expect(jobId('dispatch-wave', 'a:b', 2)).toBe('dispatch-wave__a_b__2');
    expect(jobId('x', 1)).toBe(jobId('x', 1));
  });
});

describe('backoffWithJitter', () => {
  it('stays within the exponential envelope and cap', () => {
    expect(backoffWithJitter(1, 1000, 60_000, () => 0.999)).toBeLessThan(1000);
    expect(backoffWithJitter(4, 1000, 60_000, () => 0.999)).toBeLessThan(8000);
    expect(backoffWithJitter(30, 1000, 60_000, () => 0.999)).toBeLessThan(60_000);
    expect(backoffWithJitter(3, 1000, 60_000, () => 0)).toBe(0);
  });
});

describe('worker config', () => {
  it('requires a redis url', () => {
    expect(() => loadWorkerConfig({ DATABASE_URL: 'postgres://x' })).toThrow(/REDIS_URL/);
    expect(loadWorkerConfig({ DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://localhost:6379' }).WORKER_CONCURRENCY).toBe(5);
  });
});
