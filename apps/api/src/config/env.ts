import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanish.default(false),
  /** PEM CA bundle for verifying the database certificate (Supabase signs with its own root CA). */
  DATABASE_SSL_CA_FILE: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  SUPABASE_URL: z.url(),
  /** Legacy HS256 JWT secret. When absent, tokens are verified against the project's JWKS endpoint. */
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: booleanish.default(false),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  REDIS_URL: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & { corsOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Blank values (e.g. `SUPABASE_JWT_SECRET=` copied from .env.example) mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid API configuration:\n${issues}`);
  }
  return {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
