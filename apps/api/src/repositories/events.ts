import type { Event, EventStatus, Priority } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, isoOrNull, type Cursor } from '../utils/pagination';

interface EventRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  start_at: Date | string;
  end_at: Date | string;
  timezone: string;
  location_id: string | null;
  location_name: string | null;
  status: EventStatus;
  priority: Priority;
  created_by: string | null;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  task_count: number | string;
}

const SELECT = `
  select e.id, e.organization_id, e.title, e.description, e.start_at, e.end_at, e.timezone, e.location_id,
         l.name as location_name, e.status, e.priority, e.created_by, e.published_at, e.created_at, e.updated_at,
         (select count(*) from tasks t where t.event_id = e.id) as task_count
  from events e
  left join locations l on l.id = e.location_id`;

const toEvent = (r: EventRow): Event => ({
  id: r.id,
  organizationId: r.organization_id,
  title: r.title,
  description: r.description,
  startAt: iso(r.start_at),
  endAt: iso(r.end_at),
  timezone: r.timezone,
  locationId: r.location_id,
  locationName: r.location_name,
  status: r.status,
  priority: r.priority,
  createdBy: r.created_by,
  publishedAt: isoOrNull(r.published_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  taskCount: Number(r.task_count),
});

export async function listEvents(
  db: Queryable,
  organizationId: string,
  opts: { limit: number; cursor: Cursor | null; from?: string; to?: string; status?: EventStatus; includeDrafts: boolean },
) {
  const { rows } = await db.query<EventRow>(
    `${SELECT}
     where e.organization_id = $1
       and ($2::boolean or e.status <> 'DRAFT')
       and ($3::text is null or e.status = $3)
       and ($4::timestamptz is null or e.end_at >= $4::timestamptz)
       and ($5::timestamptz is null or e.start_at < $5::timestamptz)
       and ($6::timestamptz is null or (e.start_at, e.id) > ($6::timestamptz, $7::uuid))
     order by e.start_at, e.id
     limit $8`,
    [
      organizationId,
      opts.includeDrafts,
      opts.status ?? null,
      opts.from ?? null,
      opts.to ?? null,
      opts.cursor?.t ?? null,
      opts.cursor?.id ?? null,
      opts.limit + 1,
    ],
  );
  return rows.map(toEvent);
}

export async function getEvent(db: Queryable, organizationId: string, id: string, opts: { forUpdate?: boolean } = {}) {
  if (opts.forUpdate) {
    await db.query('select 1 from events where organization_id = $1 and id = $2 for update', [organizationId, id]);
  }
  const { rows } = await db.query<EventRow>(`${SELECT} where e.organization_id = $1 and e.id = $2`, [organizationId, id]);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function insertEvent(
  db: Queryable,
  input: {
    organizationId: string;
    title: string;
    description?: string;
    startAt: string;
    endAt: string;
    timezone: string;
    locationId?: string;
    priority: Priority;
    createdBy: string;
  },
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into events (organization_id, title, description, start_at, end_at, timezone, location_id, priority, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      input.organizationId,
      input.title,
      input.description ?? null,
      input.startAt,
      input.endAt,
      input.timezone,
      input.locationId ?? null,
      input.priority,
      input.createdBy,
    ],
  );
  return (await getEvent(db, input.organizationId, rows[0]!.id))!;
}

export async function updateEvent(
  db: Queryable,
  organizationId: string,
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    startAt?: string;
    endAt?: string;
    timezone?: string;
    locationId?: string | null;
    priority?: Priority;
  },
) {
  await db.query(
    `update events set
       title = coalesce($3, title),
       description = case when $4::boolean then $5 else description end,
       start_at = coalesce($6::timestamptz, start_at),
       end_at = coalesce($7::timestamptz, end_at),
       timezone = coalesce($8, timezone),
       location_id = case when $9::boolean then $10::uuid else location_id end,
       priority = coalesce($11, priority)
     where organization_id = $1 and id = $2`,
    [
      organizationId,
      id,
      patch.title ?? null,
      patch.description !== undefined,
      patch.description ?? null,
      patch.startAt ?? null,
      patch.endAt ?? null,
      patch.timezone ?? null,
      patch.locationId !== undefined,
      patch.locationId ?? null,
      patch.priority ?? null,
    ],
  );
  return getEvent(db, organizationId, id);
}

export async function setEventStatus(db: Queryable, organizationId: string, id: string, status: EventStatus) {
  await db.query(
    `update events set status = $3,
       published_at = case when $3 = 'PUBLISHED' then coalesce(published_at, now()) else published_at end
     where organization_id = $1 and id = $2`,
    [organizationId, id, status],
  );
  return getEvent(db, organizationId, id);
}
