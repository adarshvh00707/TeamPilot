import type { Location } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, isoOrNull, type Cursor } from '../utils/pagination';

interface LocationRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  archived_at: Date | string | null;
  created_at: Date | string;
}

const COLUMNS = 'id, organization_id, name, description, metadata, archived_at, created_at';

const toLocation = (r: LocationRow): Location => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  description: r.description,
  metadata: r.metadata ?? {},
  archivedAt: isoOrNull(r.archived_at),
  createdAt: iso(r.created_at),
});

export async function listLocations(
  db: Queryable,
  organizationId: string,
  opts: { limit: number; cursor: Cursor | null; includeArchived: boolean },
) {
  const { rows } = await db.query<LocationRow>(
    `select ${COLUMNS} from locations
     where organization_id = $1
       and ($2::boolean or archived_at is null)
       and ($3::timestamptz is null or (created_at, id) > ($3::timestamptz, $4::uuid))
     order by created_at, id
     limit $5`,
    [organizationId, opts.includeArchived, opts.cursor?.t ?? null, opts.cursor?.id ?? null, opts.limit + 1],
  );
  return rows.map(toLocation);
}

export async function getLocation(db: Queryable, organizationId: string, id: string) {
  const { rows } = await db.query<LocationRow>(
    `select ${COLUMNS} from locations where organization_id = $1 and id = $2`,
    [organizationId, id],
  );
  return rows[0] ? toLocation(rows[0]) : null;
}

export async function insertLocation(
  db: Queryable,
  input: { organizationId: string; name: string; description?: string; metadata?: Record<string, unknown> },
) {
  const { rows } = await db.query<LocationRow>(
    `insert into locations (organization_id, name, description, metadata)
     values ($1, $2, $3, $4) returning ${COLUMNS}`,
    [input.organizationId, input.name, input.description ?? null, JSON.stringify(input.metadata ?? {})],
  );
  return toLocation(rows[0]!);
}

export async function updateLocation(
  db: Queryable,
  organizationId: string,
  id: string,
  patch: { name?: string; description?: string | null; metadata?: Record<string, unknown>; archived?: boolean },
) {
  const { rows } = await db.query<LocationRow>(
    `update locations set
       name = coalesce($3, name),
       description = case when $4::boolean then $5 else description end,
       metadata = coalesce($6::jsonb, metadata),
       archived_at = case when $7::boolean is null then archived_at
                          when $7 then coalesce(archived_at, now()) else null end
     where organization_id = $1 and id = $2
     returning ${COLUMNS}`,
    [
      organizationId,
      id,
      patch.name ?? null,
      patch.description !== undefined,
      patch.description ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
      patch.archived ?? null,
    ],
  );
  return rows[0] ? toLocation(rows[0]) : null;
}
