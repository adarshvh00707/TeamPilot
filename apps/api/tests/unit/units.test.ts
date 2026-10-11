import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env';
import { assertCanManage } from '../../src/services/members';
import { slugify } from '../../src/services/organizations';
import { decodeCursor, encodeCursor } from '../../src/utils/pagination';

describe('slugify', () => {
  it('normalizes names', () => {
    expect(slugify('Café Événements & Co.')).toBe('cafe-evenements-co');
    expect(slugify('AB')).toBe('org-ab');
    expect(slugify('!!!')).toBe('org-team');
  });
});

describe('assertCanManage', () => {
  it('lets owners manage anyone', () => {
    expect(() => assertCanManage('OWNER', 'OWNER', 'STAFF')).not.toThrow();
  });
  it('requires admins to outrank the target and not grant above themselves', () => {
    expect(() => assertCanManage('ADMIN', 'STAFF', 'MANAGER')).not.toThrow();
    expect(() => assertCanManage('ADMIN', 'ADMIN', 'STAFF')).toThrow();
    expect(() => assertCanManage('ADMIN', 'STAFF', 'OWNER')).toThrow();
  });
});

describe('cursor encoding', () => {
  it('round-trips and rejects tampering', () => {
    const c = { t: new Date().toISOString(), id: 'abc' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(() => decodeCursor('garbage')).toThrow();
  });
});

describe('config', () => {
  it('fails fast with a readable message on missing configuration', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
  it('parses CORS origins', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://x', SUPABASE_URL: 'https://p.supabase.co', CORS_ORIGINS: 'https://a.com, https://b.com' });
    expect(cfg.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(cfg.SUPABASE_JWT_SECRET).toBeUndefined();
  });
});
