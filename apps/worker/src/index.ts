import { createServer } from 'node:http';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { pino } from 'pino';
import { loadWorkerConfig } from './config';
import { DEFAULT_JOB_OPTIONS, QUEUES, jobId } from './queues/definitions';
import { processMaintenance } from './processors/maintenance';

const config = loadWorkerConfig();
const logger = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });

const url = new URL(config.REDIS_URL);
const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || 6379),
  username: url.username || undefined,
  password: url.password ? decodeURIComponent(url.password) : undefined,
  tls: url.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null,
};

const maintenanceQueue = new Queue(QUEUES.maintenance, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });

const workers = [
  new Worker(QUEUES.maintenance, (job) => processMaintenance(job, logger), {
    connection,
    concurrency: config.WORKER_CONCURRENCY,
  }),
];

for (const w of workers) {
  w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
  w.on('error', (err) => logger.error({ queue: w.name, err }, 'worker error'));
}

await maintenanceQueue.upsertJobScheduler(
  jobId('heartbeat'),
  { every: 60_000 },
  { name: 'heartbeat', data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } },
);

const health = createServer((req, res) => {
  const ok = workers.every((w) => w.isRunning());
  res.writeHead(req.url === '/health' && ok ? 200 : 503, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: ok ? 'ok' : 'degraded' }));
});
health.listen(config.WORKER_HEALTH_PORT, () => logger.info({ port: config.WORKER_HEALTH_PORT }, 'worker started'));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker shutting down');
  setTimeout(() => process.exit(1), 30_000).unref();
  // Worker.close() waits for in-flight jobs to finish, so restarts do not drop work.
  await Promise.allSettled(workers.map((w) => w.close()));
  await maintenanceQueue.close();
  health.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
