import type { Member, MembershipStatus, Role } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, type Cursor } from '../utils/pagination';

interface MembershipRow {
  organization_id: string;
  user_id: string;
  role: Role;
  status: MembershipStatus;
}

export async function findActiveMembership(db: Queryable, organizationId: string, userId: string) {
  const { rows } = await db.query<MembershipRow>(
    `select organization_id, user_id, role, status from memberships
     where organization_id = $1 and user_id = $2 and status = 'ACTIVE'`,
    [organizationId, userId],
  );
  return rows[0] ?? null;
}

export async function lockMembership(db: Queryable, organizationId: string, userId: string) {
  const { rows } = await db.query<MembershipRow>(
    `select organization_id, user_id, role, status from memberships
     where organization_id = $1 and user_id = $2 for update`,
    [organizationId, userId],
  );
  return rows[0] ?? null;
}

export async function countActiveOwners(db: Queryable, organizationId: string): Promise<number> {
  // Lock owner rows so concurrent demotions cannot both pass the last-owner check.
  const { rows } = await db.query<{ user_id: string }>(
    `select user_id from memberships
     where organization_id = $1 and role = 'OWNER' and status = 'ACTIVE' for update`,
    [organizationId],
  );
  return rows.length;
}

export async function insertMembership(db: Queryable, organizationId: string, userId: string, role: Role) {
  await db.query(
    `insert into memberships (organization_id, user_id, role, status) values ($1, $2, $3, 'ACTIVE')`,
    [organizationId, userId, role],
  );
}

export async function reactivateMembership(db: Queryable, organizationId: string, userId: string, role: Role) {
  await db.query(
    `update memberships set role = $3, status = 'ACTIVE', joined_at = now()
     where organization_id = $1 and user_id = $2`,
    [organizationId, userId, role],
  );
}

export async function updateMembership(
  db: Queryable,
  organizationId: string,
  userId: string,
  patch: { role?: Role; status?: MembershipStatus },
) {
  await db.query(
    `update memberships set role = coalesce($3, role), status = coalesce($4, status)
     where organization_id = $1 and user_id = $2`,
    [organizationId, userId, patch.role ?? null, patch.status ?? null],
  );
}

interface MemberRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  status: MembershipStatus;
  joined_at: Date | string;
}

const toMember = (r: MemberRow): Member => ({
  userId: r.user_id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  role: r.role,
  status: r.status,
  joinedAt: iso(r.joined_at),
});

export async function listMembers(
  db: Queryable,
  organizationId: string,
  opts: { limit: number; cursor: Cursor | null; includeInactive: boolean },
) {
  const { rows } = await db.query<MemberRow>(
    `select m.user_id, p.display_name, p.avatar_url, m.role, m.status, m.joined_at
     from memberships m left join profiles p on p.id = m.user_id
     where m.organization_id = $1
       and ($2::boolean or m.status = 'ACTIVE')
       and ($3::timestamptz is null or (m.joined_at, m.user_id) > ($3::timestamptz, $4::uuid))
     order by m.joined_at, m.user_id
     limit $5`,
    [organizationId, opts.includeInactive, opts.cursor?.t ?? null, opts.cursor?.id ?? null, opts.limit + 1],
  );
  return rows.map(toMember);
}

export async function getMember(db: Queryable, organizationId: string, userId: string) {
  const { rows } = await db.query<MemberRow>(
    `select m.user_id, p.display_name, p.avatar_url, m.role, m.status, m.joined_at
     from memberships m left join profiles p on p.id = m.user_id
     where m.organization_id = $1 and m.user_id = $2`,
    [organizationId, userId],
  );
  return rows[0] ? toMember(rows[0]) : null;
}
