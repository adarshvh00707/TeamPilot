import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Db, Queryable, QueryResult } from './types';

export function createPgDb(opts: { connectionString: string; ssl: boolean; caFile?: string; max: number }): Db {
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    ssl: opts.ssl
      ? { rejectUnauthorized: true, ...(opts.caFile ? { ca: readFileSync(opts.caFile, 'utf8') } : {}) }
      : undefined,
    max: opts.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // Idle clients can be dropped by the network (sleep, pooler restarts); without a listener pg crashes the process.
  pool.on('error', (err) => console.warn(`[db] idle client error: ${err.message}`));

  const wrap = (q: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
      const res = await q.query(text, params as unknown[] | undefined);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
    },
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async ping() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    },
  };
}
