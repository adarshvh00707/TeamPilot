export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  /** Runs fn inside a single transaction; rolls back if fn throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}
