import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { unauthorized } from '../utils/errors';

export interface AuthIdentity {
  userId: string;
  email: string | null;
}

export type TokenVerifier = (token: string) => Promise<AuthIdentity>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toIdentity(payload: JWTPayload): AuthIdentity {
  if (!payload.sub || !UUID_RE.test(payload.sub)) throw unauthorized('Invalid token subject');
  if (payload.role === 'anon') throw unauthorized('Anonymous tokens are not accepted');
  const email = typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null;
  return { userId: payload.sub, email };
}

/** Verifies Supabase access tokens, via the legacy shared secret if configured, otherwise the project's JWKS. */
export function createSupabaseTokenVerifier(opts: { supabaseUrl: string; jwtSecret?: string }): TokenVerifier {
  const issuer = `${opts.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const verifyOpts = { issuer, audience: 'authenticated' };
  if (opts.jwtSecret) {
    const key = new TextEncoder().encode(opts.jwtSecret);
    return async (token) => {
      const { payload } = await jwtVerify(token, key, { ...verifyOpts, algorithms: ['HS256'] });
      return toIdentity(payload);
    };
  }
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, verifyOpts);
    return toIdentity(payload);
  };
}

export function requireAuth(verify: TokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    try {
      req.auth = await verify(header.slice('Bearer '.length).trim());
    } catch {
      throw unauthorized('Invalid or expired token');
    }
    next();
  };
}
