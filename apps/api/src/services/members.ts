import { ROLE_RANK, type Member, type Role, type UpdateMembershipInput } from '@teampilot/shared';
import type { Db } from '../db/types';
import { writeAudit } from '../repositories/audit';
import { countActiveOwners, getMember, lockMembership, updateMembership } from '../repositories/memberships';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';

/**
 * Role-management rules:
 *  - Nobody changes their own role or status (prevents self-escalation and accidental lock-out).
 *  - OWNER may manage anyone, including granting OWNER.
 *  - Otherwise the actor must strictly outrank the target's current role, and may not grant a role above their own.
 *  - The organization must always keep at least one active OWNER.
 */
export function assertCanManage(actorRole: Role, targetRole: Role, newRole?: Role): void {
  if (actorRole === 'OWNER') return;
  if (ROLE_RANK[actorRole] <= ROLE_RANK[targetRole]) throw forbidden('You cannot manage a member with this role');
  if (newRole && ROLE_RANK[newRole] > ROLE_RANK[actorRole]) throw forbidden('You cannot grant a role above your own');
}

export async function changeMembership(
  db: Db,
  ctx: { organizationId: string; actorUserId: string; actorRole: Role },
  targetUserId: string,
  input: UpdateMembershipInput,
): Promise<Member> {
  if (targetUserId === ctx.actorUserId) throw forbidden('You cannot change your own membership');

  return db.transaction(async (tx) => {
    const target = await lockMembership(tx, ctx.organizationId, targetUserId);
    if (!target) throw notFound('Member not found');
    assertCanManage(ctx.actorRole, target.role, input.role);

    const losesOwner =
      target.role === 'OWNER' &&
      target.status === 'ACTIVE' &&
      ((input.role && input.role !== 'OWNER') || (input.status && input.status !== 'ACTIVE'));
    if (losesOwner && (await countActiveOwners(tx, ctx.organizationId)) <= 1) {
      throw conflict('An organization must keep at least one active owner');
    }
    if (input.role === target.role && (input.status === undefined || input.status === target.status)) {
      throw badRequest('No changes requested');
    }

    await updateMembership(tx, ctx.organizationId, targetUserId, input);
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      action: 'membership.updated',
      entityType: 'membership',
      entityId: targetUserId,
      metadata: { from: { role: target.role, status: target.status }, to: input },
    });
    return (await getMember(tx, ctx.organizationId, targetUserId))!;
  });
}
