import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Db, Queryable } from '../../src/db/types';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../../../../supabase/migrations');

export interface TestDb {
  pg: PGlite;
  db: Db;
  createUser(email: string, displayName?: string): Promise<string>;
}

function wrap(q: PGlite | Transaction): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const r = await q.query<T>(text, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  const db: Db = {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    ping: async () => {
      await pg.query('select 1');
    },
    close: () => pg.close(),
  };

  return {
    pg,
    db,
    async createUser(email, displayName) {
      const id = randomUUID();
      await pg.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
        id,
        email.toLowerCase(),
        JSON.stringify(displayName ? { display_name: displayName } : {}),
      ]);
      return id;
    },
  };
}

/** Runs fn as the `authenticated` role with the given user's JWT claims, as PostgREST would. */
export async function asUser<T>(pg: PGlite, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '',
    ]);
    await tx.exec(userId ? 'set local role authenticated' : 'set local role anon');
    return fn(tx);
  });
}
