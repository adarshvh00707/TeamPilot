import { Router } from 'express';
import { z } from 'zod';
import {
  createInvitationSchema,
  createLocationSchema,
  createOrganizationSchema,
  paginationQuerySchema,
  updateLocationSchema,
  updateMembershipSchema,
  updateOrganizationSchema,
  uuidSchema,
} from '@teampilot/shared';
import type { AppDeps } from '../app';
import { requireOrgRole } from '../middleware/org-access';
import { writeAudit } from '../repositories/audit';
import { listOpenInvitations } from '../repositories/invitations';
import { getLocation, insertLocation, listLocations, updateLocation } from '../repositories/locations';
import { getMember, listMembers } from '../repositories/memberships';
import { getOrganization, listOrganizationsForUser, updateOrganization } from '../repositories/organizations';
import { createInvitation, revokeInvitation } from '../services/invitations';
import { changeMembership } from '../services/members';
import { createOrganization } from '../services/organizations';
import { notFound } from '../utils/errors';
import { decodeCursor, paginate } from '../utils/pagination';

const listQuery = paginationQuerySchema.extend({
  includeArchived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  includeInactive: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const idParam = (value: unknown, label: string) => {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw notFound(`${label} not found`);
  return parsed.data;
};

export function organizationsRouter({ db, config }: AppDeps): Router {
  const r = Router();
  const member = requireOrgRole(db, 'STAFF');
  const manager = requireOrgRole(db, 'MANAGER');
  const admin = requireOrgRole(db, 'ADMIN');

  r.get('/organizations', async (req, res) => {
    res.json({ data: await listOrganizationsForUser(db, req.auth!.userId) });
  });

  r.post('/organizations', async (req, res) => {
    const input = createOrganizationSchema.parse(req.body);
    res.status(201).json({ data: await createOrganization(db, req.auth!.userId, input) });
  });

  r.get('/organizations/:organizationId', member, async (req, res) => {
    const org = await getOrganization(db, req.org!.organizationId);
    if (!org) throw notFound('Organization not found');
    res.json({ data: { ...org, role: req.org!.role } });
  });

  r.patch('/organizations/:organizationId', admin, async (req, res) => {
    const input = updateOrganizationSchema.parse(req.body);
    const org = await db.transaction(async (tx) => {
      const updated = await updateOrganization(tx, req.org!.organizationId, input);
      await writeAudit(tx, {
        organizationId: updated.id,
        actorUserId: req.auth!.userId,
        action: 'organization.updated',
        entityType: 'organization',
        entityId: updated.id,
        metadata: { fields: Object.keys(input) },
      });
      return updated;
    });
    res.json({ data: { ...org, role: req.org!.role } });
  });

  // Members
  r.get('/organizations/:organizationId/members', member, async (req, res) => {
    const q = listQuery.parse(req.query);
    const includeInactive = q.includeInactive && ['OWNER', 'ADMIN'].includes(req.org!.role);
    const rows = await listMembers(db, req.org!.organizationId, {
      limit: q.limit,
      cursor: decodeCursor(q.cursor),
      includeInactive,
    });
    const page = paginate(rows, q.limit, (m) => ({ t: m.joinedAt, id: m.userId }));
    res.json({ data: page.items, meta: { nextCursor: page.nextCursor } });
  });

  r.get('/organizations/:organizationId/members/:userId', member, async (req, res) => {
    const m = await getMember(db, req.org!.organizationId, idParam(req.params.userId, 'Member'));
    if (!m || (m.status !== 'ACTIVE' && !['OWNER', 'ADMIN'].includes(req.org!.role))) throw notFound('Member not found');
    res.json({ data: m });
  });

  r.patch('/organizations/:organizationId/members/:userId', admin, async (req, res) => {
    const input = updateMembershipSchema.parse(req.body);
    const updated = await changeMembership(
      db,
      { organizationId: req.org!.organizationId, actorUserId: req.auth!.userId, actorRole: req.org!.role },
      idParam(req.params.userId, 'Member'),
      input,
    );
    res.json({ data: updated });
  });

  // Invitations
  r.get('/organizations/:organizationId/invitations', admin, async (req, res) => {
    res.json({ data: await listOpenInvitations(db, req.org!.organizationId) });
  });

  r.post('/organizations/:organizationId/invitations', admin, async (req, res) => {
    const input = createInvitationSchema.parse(req.body);
    const invitation = await createInvitation(
      db,
      {
        organizationId: req.org!.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: req.org!.role,
        ttlHours: config.INVITATION_TTL_HOURS,
      },
      input,
    );
    res.status(201).json({ data: invitation });
  });

  r.post('/organizations/:organizationId/invitations/:invitationId/revoke', admin, async (req, res) => {
    const revoked = await revokeInvitation(
      db,
      { organizationId: req.org!.organizationId, actorUserId: req.auth!.userId, actorRole: req.org!.role },
      idParam(req.params.invitationId, 'Invitation'),
    );
    res.json({ data: revoked });
  });

  // Locations
  r.get('/organizations/:organizationId/locations', member, async (req, res) => {
    const q = listQuery.parse(req.query);
    const rows = await listLocations(db, req.org!.organizationId, {
      limit: q.limit,
      cursor: decodeCursor(q.cursor),
      includeArchived: q.includeArchived,
    });
    const page = paginate(rows, q.limit, (l) => ({ t: l.createdAt, id: l.id }));
    res.json({ data: page.items, meta: { nextCursor: page.nextCursor } });
  });

  r.get('/organizations/:organizationId/locations/:locationId', member, async (req, res) => {
    const loc = await getLocation(db, req.org!.organizationId, idParam(req.params.locationId, 'Location'));
    if (!loc) throw notFound('Location not found');
    res.json({ data: loc });
  });

  r.post('/organizations/:organizationId/locations', manager, async (req, res) => {
    const input = createLocationSchema.parse(req.body);
    const loc = await db.transaction(async (tx) => {
      const created = await insertLocation(tx, { organizationId: req.org!.organizationId, ...input });
      await writeAudit(tx, {
        organizationId: req.org!.organizationId,
        actorUserId: req.auth!.userId,
        action: 'location.created',
        entityType: 'location',
        entityId: created.id,
      });
      return created;
    });
    res.status(201).json({ data: loc });
  });

  r.patch('/organizations/:organizationId/locations/:locationId', manager, async (req, res) => {
    const input = updateLocationSchema.parse(req.body);
    const locationId = idParam(req.params.locationId, 'Location');
    const loc = await db.transaction(async (tx) => {
      const updated = await updateLocation(tx, req.org!.organizationId, locationId, input);
      if (!updated) throw notFound('Location not found');
      await writeAudit(tx, {
        organizationId: req.org!.organizationId,
        actorUserId: req.auth!.userId,
        action: 'location.updated',
        entityType: 'location',
        entityId: updated.id,
        metadata: { fields: Object.keys(input) },
      });
      return updated;
    });
    res.json({ data: loc });
  });

  return r;
}
