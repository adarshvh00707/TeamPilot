import { badRequest } from './errors';

export interface Cursor {
  t: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.t !== 'string' || typeof parsed.id !== 'string' || Number.isNaN(Date.parse(parsed.t))) {
      throw new Error('bad cursor');
    }
    return { t: parsed.t, id: parsed.id };
  } catch {
    throw badRequest('Invalid pagination cursor');
  }
}

/** Expects rows fetched with limit + 1. */
export function paginate<T>(rows: T[], limit: number, toCursor: (row: T) => Cursor) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null };
}

export function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

export function isoOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : iso(v);
}
