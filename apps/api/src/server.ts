import { createApp } from './app';
import { loadConfig } from './config/env';
import { createPgDb } from './db/pg';
import { createSupabaseTokenVerifier } from './middleware/auth';
import { createLogger } from './utils/logger';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, 'api');
const db = createPgDb({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL,
  caFile: config.DATABASE_SSL_CA_FILE,
  max: config.DATABASE_POOL_MAX,
});
const verifyToken = createSupabaseTokenVerifier({
  supabaseUrl: config.SUPABASE_URL,
  jwtSecret: config.SUPABASE_JWT_SECRET,
});

const app = createApp({ db, config, logger, verifyToken });
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 15_000);
  force.unref();
  server.close(async () => {
    await db.close().catch((err) => logger.error({ err }, 'db close failed'));
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
