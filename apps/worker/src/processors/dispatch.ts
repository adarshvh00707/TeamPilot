import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { Db } from '../../../api/src/db/types';
import { sweepDispatch } from '../../../api/src/services/dispatch';

/** Expires due offers and moves settled dispatch rounds on to the next wave or escalation. */
export async function processDispatch(job: Job, db: Db, logger: Logger) {
  switch (job.name) {
    case 'sweep': {
      const result = await sweepDispatch(db);
      if (result.processed) logger.info({ jobId: job.id, ...result }, 'dispatch sweep');
      return result;
    }
    default:
      throw new Error(`Unknown dispatch job: ${job.name}`);
  }
}
