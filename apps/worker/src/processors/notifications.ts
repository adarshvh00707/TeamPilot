import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { Db } from '../../../api/src/db/types';
import { checkPushReceipts, processNotificationJobs, type PushSender } from '../../../api/src/services/notifications';

export async function processNotifications(job: Job, db: Db, sender: PushSender, logger: Logger) {
  switch (job.name) {
    case 'send': {
      const result = await processNotificationJobs(db, sender);
      if (result.claimed) logger.info({ jobId: job.id, ...result }, 'push send');
      return result;
    }
    case 'receipts': {
      const result = await checkPushReceipts(db, sender);
      if (result.checked) logger.info({ jobId: job.id, ...result }, 'push receipts');
      return result;
    }
    default:
      throw new Error(`Unknown notifications job: ${job.name}`);
  }
}
