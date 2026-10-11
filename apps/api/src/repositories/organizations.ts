import type { Organization, OrganizationWithRole, Role } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso } from '../utils/pagination';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLUMNS = 'o.id, o.name, o.slug, o.timezone, o.settings, o.created_at, o.updated_at';

export const toOrganization = (r: OrgRow): Organization => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  timezone: r.timezone,
  settings: r.settings ?? {},
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function insertOrganization(
  db: Queryable,
  input: { name: string; slug: string; timezone: string },
): Promise<Organization> {
  const { rows } = await db.query<OrgRow>(
    `insert into organizations as o (name, slug, timezone) values ($1, $2, $3) returning ${COLUMNS}`,
    [input.name, input.slug, input.timezone],
  );
  return toOrganization(rows[0]!);
}

export async function slugExists(db: Queryable, slug: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from organizations where slug = $1', [slug]);
  return rows.length > 0;
}

export async function getOrganization(db: Queryable, id: string): Promise<Organization | null> {
  const { rows } = await db.query<OrgRow>(`select ${COLUMNS} from organizations o where o.id = $1`, [id]);
  return rows[0] ? toOrganization(rows[0]) : null;
}

export async function listOrganizationsForUser(db: Queryable, userId: string): Promise<OrganizationWithRole[]> {
  const { rows } = await db.query<OrgRow & { role: Role }>(
    `select ${COLUMNS}, m.role from organizations o
     join memberships m on m.organization_id = o.id
     where m.user_id = $1 and m.status = 'ACTIVE'
     order by o.name`,
    [userId],
  );
  return rows.map((r) => ({ ...toOrganization(r), role: r.role }));
}

export async function updateOrganization(
  db: Queryable,
  id: string,
  patch: { name?: string; timezone?: string; settings?: Record<string, unknown> },
): Promise<Organization> {
  const { rows } = await db.query<OrgRow>(
    `update organizations o set
       name = coalesce($2, o.name),
       timezone = coalesce($3, o.timezone),
       settings = case when $4::jsonb is null then o.settings else o.settings || $4::jsonb end
     where o.id = $1 returning ${COLUMNS}`,
    [id, patch.name ?? null, patch.timezone ?? null, patch.settings ? JSON.stringify(patch.settings) : null],
  );
  return toOrganization(rows[0]!);
}
