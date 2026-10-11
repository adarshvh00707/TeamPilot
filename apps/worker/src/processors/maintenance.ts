import type { Job } from 'bullmq';
import type { Logger } from 'pino';

export async function processMaintenance(job: Job, logger: Logger): Promise<{ ok: true }> {
  switch (job.name) {
    case 'heartbeat':
      logger.debug({ jobId: job.id }, 'heartbeat');
      return { ok: true };
    default:
      throw new Error(`Unknown maintenance job: ${job.name}`);
  }
}
