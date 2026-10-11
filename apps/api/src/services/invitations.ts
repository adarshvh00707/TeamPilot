import { createHash, randomBytes } from 'node:crypto';
import { ROLE_RANK, type CreatedInvitation, type CreateInvitationInput, type Role } from '@teampilot/shared';
import type { Db } from '../db/types';
import { writeAudit } from '../repositories/audit';
import {
  insertInvitation,
  lockInvitation,
  lockInvitationByTokenHash,
  markAccepted,
  markRevoked,
  revokeExpiredOpenInvitation,
  toInvitation,
} from '../repositories/invitations';
import { insertMembership, lockMembership, reactivateMembership } from '../repositories/memberships';
import { ensureProfile } from '../repositories/profiles';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';

export const hashInvitationToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

export async function createInvitation(
  db: Db,
  ctx: { organizationId: string; actorUserId: string; actorRole: Role; ttlHours: number },
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  if (ctx.actorRole !== 'OWNER' && ROLE_RANK[input.role] > ROLE_RANK[ctx.actorRole]) {
    throw forbidden('You cannot invite someone with a role above your own');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ctx.ttlHours * 3600_000);

  return db.transaction(async (tx) => {
    const { rows: existing } = await tx.query(
      `select 1 from memberships m join auth.users u on u.id = m.user_id
       where m.organization_id = $1 and m.status = 'ACTIVE' and lower(u.email) = $2`,
      [ctx.organizationId, input.email],
    );
    if (existing.length) throw conflict('This person is already a member');

    await revokeExpiredOpenInvitation(tx, ctx.organizationId, input.email);
    const invitation = await insertInvitation(tx, {
      organizationId: ctx.organizationId,
      email: input.email,
      role: input.role,
      tokenHash: hashInvitationToken(token),
      invitedBy: ctx.actorUserId,
      expiresAt,
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: invitation.id,
      metadata: { role: input.role },
    });
    return { ...invitation, token };
  });
}

export async function acceptInvitation(
  db: Db,
  user: { userId: string; email: string | null },
  token: string,
): Promise<{ organizationId: string; role: Role }> {
  return db.transaction(async (tx) => {
    const row = await lockInvitationByTokenHash(tx, hashInvitationToken(token));
    // Uniform error for unknown/expired/used tokens to avoid leaking which invitations exist.
    const invalid = () => badRequest('This invitation is invalid or has expired');
    if (!row || row.accepted_at || row.revoked_at || new Date(row.expires_at) <= new Date()) throw invalid();
    if (!user.email || user.email.toLowerCase() !== row.email) {
      throw forbidden('This invitation was sent to a different email address');
    }

    await ensureProfile(tx, user.userId);
    const membership = await lockMembership(tx, row.organization_id, user.userId);
    if (membership?.status === 'ACTIVE') throw conflict('You are already a member of this organization');
    if (membership) await reactivateMembership(tx, row.organization_id, user.userId, row.role);
    else await insertMembership(tx, row.organization_id, user.userId, row.role);

    await markAccepted(tx, row.id, user.userId);
    await writeAudit(tx, {
      organizationId: row.organization_id,
      actorUserId: user.userId,
      action: 'invitation.accepted',
      entityType: 'invitation',
      entityId: row.id,
      metadata: { role: row.role },
    });
    return { organizationId: row.organization_id, role: row.role };
  });
}

export async function revokeInvitation(
  db: Db,
  ctx: { organizationId: string; actorUserId: string; actorRole: Role },
  invitationId: string,
) {
  return db.transaction(async (tx) => {
    const row = await lockInvitation(tx, ctx.organizationId, invitationId);
    if (!row) throw notFound('Invitation not found');
    if (ctx.actorRole !== 'OWNER' && ROLE_RANK[row.role] > ROLE_RANK[ctx.actorRole]) throw forbidden();
    if (row.accepted_at || row.revoked_at) throw conflict('Invitation is no longer open');
    await markRevoked(tx, row.id);
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: row.id,
    });
    return { ...toInvitation(row), revokedAt: new Date().toISOString() };
  });
}
