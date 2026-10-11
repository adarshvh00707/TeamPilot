import type { Invitation, Role } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, isoOrNull } from '../utils/pagination';

interface InvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

const COLUMNS = 'id, organization_id, email, role, expires_at, accepted_at, revoked_at, created_at';

export const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id,
  email: r.email,
  role: r.role,
  expiresAt: iso(r.expires_at),
  acceptedAt: isoOrNull(r.accepted_at),
  revokedAt: isoOrNull(r.revoked_at),
  createdAt: iso(r.created_at),
});

export async function revokeExpiredOpenInvitation(db: Queryable, organizationId: string, email: string) {
  await db.query(
    `update invitations set revoked_at = now()
     where organization_id = $1 and email = $2 and accepted_at is null and revoked_at is null and expires_at <= now()`,
    [organizationId, email],
  );
}

export async function insertInvitation(
  db: Queryable,
  input: { organizationId: string; email: string; role: Role; tokenHash: string; invitedBy: string; expiresAt: Date },
): Promise<Invitation> {
  const { rows } = await db.query<InvitationRow>(
    `insert into invitations (organization_id, email, role, token_hash, invited_by, expires_at)
     values ($1, $2, $3, $4, $5, $6) returning ${COLUMNS}`,
    [input.organizationId, input.email, input.role, input.tokenHash, input.invitedBy, input.expiresAt],
  );
  return toInvitation(rows[0]!);
}

export async function listOpenInvitations(db: Queryable, organizationId: string): Promise<Invitation[]> {
  const { rows } = await db.query<InvitationRow>(
    `select ${COLUMNS} from invitations
     where organization_id = $1 and accepted_at is null and revoked_at is null
     order by created_at desc limit 200`,
    [organizationId],
  );
  return rows.map(toInvitation);
}

export async function lockInvitationByTokenHash(db: Queryable, tokenHash: string) {
  const { rows } = await db.query<InvitationRow>(
    `select ${COLUMNS} from invitations where token_hash = $1 for update`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function lockInvitation(db: Queryable, organizationId: string, id: string) {
  const { rows } = await db.query<InvitationRow>(
    `select ${COLUMNS} from invitations where organization_id = $1 and id = $2 for update`,
    [organizationId, id],
  );
  return rows[0] ?? null;
}

export async function markAccepted(db: Queryable, id: string, userId: string) {
  await db.query('update invitations set accepted_at = now(), accepted_by = $2 where id = $1', [id, userId]);
}

export async function markRevoked(db: Queryable, id: string) {
  await db.query('update invitations set revoked_at = now() where id = $1', [id]);
}
