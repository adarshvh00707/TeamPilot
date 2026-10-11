import type { RequestHandler } from 'express';
import { hasRoleAtLeast, type Role } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { findActiveMembership } from '../repositories/memberships';
import { forbidden, notFound, unauthorized } from '../utils/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's active membership for :organizationId. Non-members get 404 so that
 * organization existence is not disclosed.
 */
export function requireOrgRole(db: Queryable, minimum: Role = 'STAFF'): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    const organizationId = req.params.organizationId;
    if (typeof organizationId !== 'string' || !UUID_RE.test(organizationId)) throw notFound('Organization not found');
    const membership = await findActiveMembership(db, organizationId, req.auth.userId);
    if (!membership) throw notFound('Organization not found');
    if (!hasRoleAtLeast(membership.role, minimum)) throw forbidden();
    req.org = { organizationId, role: membership.role };
    next();
  };
}
