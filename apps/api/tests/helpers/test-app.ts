import { SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { createSupabaseTokenVerifier } from '../../src/middleware/auth';
import { createLogger } from '../../src/utils/logger';
import { createTestDb, type TestDb } from './test-db';

export const TEST_SUPABASE_URL = 'http://localhost:54321';
export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';

export async function createTestApp() {
  const testDb: TestDb = await createTestDb();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    SUPABASE_URL: TEST_SUPABASE_URL,
    SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_PER_MINUTE: '10000',
  });
  const logger = createLogger('silent');
  const verifyToken = createSupabaseTokenVerifier({ supabaseUrl: TEST_SUPABASE_URL, jwtSecret: TEST_JWT_SECRET });
  const app = createApp({ db: testDb.db, config, logger, verifyToken });
  return { app, ...testDb };
}

export async function tokenFor(userId: string, email: string, overrides: Record<string, unknown> = {}) {
  return new SignJWT({ email, role: 'authenticated', ...overrides })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(`${TEST_SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}
