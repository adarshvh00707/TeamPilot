import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL must start with redis:// or rediss://'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false', '1', '0']).default('false').transform((v) => v === 'true' || v === '1'),
  DATABASE_SSL_CA_FILE: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  /** Only needed when "enhanced push security" is enabled on the Expo project. */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  REMINDER_LEAD_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(30),
  NOTIFICATION_SWEEP_MS: z.coerce.number().int().min(1_000).max(300_000).default(5_000),
  DISPATCH_SWEEP_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(5),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
});

export type WorkerConfig = z.infer<typeof envSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  // Blank values copied from .env.example mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid worker configuration:\n${issues}`);
  }
  return parsed.data;
}
