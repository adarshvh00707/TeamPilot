import {
  parseDispatchPolicy,
  type AssignmentSource,
  type AssignmentStatus,
  type DispatchPolicy,
  type Priority,
  type ScheduleItem,
  type Task,
  type TaskAssignment,
  type TaskStatus,
} from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, isoOrNull, type Cursor } from '../utils/pagination';

interface TaskRow {
  id: string;
  organization_id: string;
  event_id: string | null;
  title: string;
  description: string | null;
  location_id: string | null;
  location_name: string | null;
  status: TaskStatus;
  priority: Priority;
  estimated_duration_minutes: number | null;
  required_headcount: number;
  minimum_required_headcount: number | null;
  completion_deadline: Date | string | null;
  dispatch_start_at: Date | string | null;
  offer_response_window_minutes: number;
  required_skills: string[];
  instructions: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  dispatch_policy: unknown;
  version: number;
  published_at: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  assigned_count: number | string;
  staffed_count: number | string;
}

const SELECT = `
  select t.id, t.organization_id, t.event_id, t.title, t.description, t.location_id, l.name as location_name,
         t.status, t.priority, t.estimated_duration_minutes, t.required_headcount, t.minimum_required_headcount,
         t.completion_deadline, t.dispatch_start_at, t.offer_response_window_minutes, t.required_skills,
         t.instructions, t.owner_user_id, t.created_by, t.dispatch_policy, t.version, t.published_at, t.completed_at, t.cancelled_at,
         t.created_at, t.updated_at,
         (select count(*) from task_assignments a
           where a.task_id = t.id and a.status not in ('CANCELLED', 'REASSIGNMENT_REQUIRED')) as assigned_count,
         (select count(*) from task_assignments a
           where a.task_id = t.id and a.status in ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED')) as staffed_count
  from tasks t
  left join locations l on l.id = t.location_id`;

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  organizationId: r.organization_id,
  eventId: r.event_id,
  title: r.title,
  description: r.description,
  locationId: r.location_id,
  locationName: r.location_name,
  status: r.status,
  priority: r.priority,
  estimatedDurationMinutes: r.estimated_duration_minutes,
  requiredHeadcount: r.required_headcount,
  minimumRequiredHeadcount: r.minimum_required_headcount,
  completionDeadline: isoOrNull(r.completion_deadline),
  dispatchStartAt: isoOrNull(r.dispatch_start_at),
  offerResponseWindowMinutes: r.offer_response_window_minutes,
  requiredSkills: r.required_skills ?? [],
  instructions: r.instructions,
  ownerUserId: r.owner_user_id,
  createdBy: r.created_by,
  dispatchPolicy: parseDispatchPolicy(r.dispatch_policy),
  version: r.version,
  publishedAt: isoOrNull(r.published_at),
  completedAt: isoOrNull(r.completed_at),
  cancelledAt: isoOrNull(r.cancelled_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  staffing: { assigned: Number(r.assigned_count), staffed: Number(r.staffed_count) },
});

export async function listTasks(
  db: Queryable,
  organizationId: string,
  opts: { limit: number; cursor: Cursor | null; eventId?: string; status?: TaskStatus; includeDrafts: boolean },
) {
  const { rows } = await db.query<TaskRow>(
    `${SELECT}
     where t.organization_id = $1
       and ($2::boolean or t.status <> 'DRAFT')
       and ($3::uuid is null or t.event_id = $3::uuid)
       and ($4::text is null or t.status = $4)
       and ($5::timestamptz is null or (t.created_at, t.id) < ($5::timestamptz, $6::uuid))
     order by t.created_at desc, t.id desc
     limit $7`,
    [
      organizationId,
      opts.includeDrafts,
      opts.eventId ?? null,
      opts.status ?? null,
      opts.cursor?.t ?? null,
      opts.cursor?.id ?? null,
      opts.limit + 1,
    ],
  );
  return rows.map(toTask);
}

export async function listTasksForEvent(db: Queryable, organizationId: string, eventId: string, includeDrafts: boolean) {
  const { rows } = await db.query<TaskRow>(
    `${SELECT} where t.organization_id = $1 and t.event_id = $2 and ($3::boolean or t.status <> 'DRAFT')
     order by t.created_at, t.id`,
    [organizationId, eventId, includeDrafts],
  );
  return rows.map(toTask);
}

export async function getTask(db: Queryable, organizationId: string, id: string, opts: { forUpdate?: boolean } = {}) {
  if (opts.forUpdate) {
    await db.query('select 1 from tasks where organization_id = $1 and id = $2 for update', [organizationId, id]);
  }
  const { rows } = await db.query<TaskRow>(`${SELECT} where t.organization_id = $1 and t.id = $2`, [organizationId, id]);
  return rows[0] ? toTask(rows[0]) : null;
}

export interface TaskFields {
  eventId?: string | null;
  title?: string;
  description?: string | null;
  locationId?: string | null;
  priority?: Priority;
  estimatedDurationMinutes?: number | null;
  requiredHeadcount?: number;
  minimumRequiredHeadcount?: number | null;
  completionDeadline?: string | null;
  dispatchStartAt?: string | null;
  offerResponseWindowMinutes?: number;
  requiredSkills?: string[];
  instructions?: string | null;
  ownerUserId?: string | null;
  dispatchPolicy?: Partial<DispatchPolicy>;
}

const toParam = (k: keyof TaskFields, v: unknown) => (k === 'dispatchPolicy' ? JSON.stringify(v) : v);

const FIELD_COLUMNS: Record<keyof TaskFields, string> = {
  eventId: 'event_id',
  title: 'title',
  description: 'description',
  locationId: 'location_id',
  priority: 'priority',
  estimatedDurationMinutes: 'estimated_duration_minutes',
  requiredHeadcount: 'required_headcount',
  minimumRequiredHeadcount: 'minimum_required_headcount',
  completionDeadline: 'completion_deadline',
  dispatchStartAt: 'dispatch_start_at',
  offerResponseWindowMinutes: 'offer_response_window_minutes',
  requiredSkills: 'required_skills',
  instructions: 'instructions',
  ownerUserId: 'owner_user_id',
  dispatchPolicy: 'dispatch_policy',
};

export async function insertTask(
  db: Queryable,
  input: TaskFields & { organizationId: string; title: string; createdBy: string },
) {
  const keys = (Object.keys(FIELD_COLUMNS) as Array<keyof TaskFields>).filter((k) => input[k] !== undefined);
  const columns = ['organization_id', 'created_by', ...keys.map((k) => FIELD_COLUMNS[k])];
  const values = [input.organizationId, input.createdBy, ...keys.map((k) => toParam(k, input[k]))];
  const { rows } = await db.query<{ id: string }>(
    `insert into tasks (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    values,
  );
  return (await getTask(db, input.organizationId, rows[0]!.id))!;
}

/** Column names come only from FIELD_COLUMNS; values are parameterized. Bumps version. */
export async function updateTaskFields(db: Queryable, organizationId: string, id: string, patch: TaskFields) {
  const keys = (Object.keys(FIELD_COLUMNS) as Array<keyof TaskFields>).filter((k) => patch[k] !== undefined);
  const sets = keys.map((k, i) => `${FIELD_COLUMNS[k]} = $${i + 3}`);
  await db.query(
    `update tasks set ${[...sets, 'version = version + 1'].join(', ')} where organization_id = $1 and id = $2`,
    [organizationId, id, ...keys.map((k) => toParam(k, patch[k]))],
  );
  return getTask(db, organizationId, id);
}

export async function setTaskStatus(db: Queryable, organizationId: string, id: string, status: TaskStatus) {
  await db.query(
    `update tasks set status = $3, version = version + 1,
       published_at = case when $3 <> 'DRAFT' then coalesce(published_at, now()) else published_at end,
       completed_at = case when $3 = 'COMPLETED' then now() else completed_at end,
       cancelled_at = case when $3 = 'CANCELLED' then now() else cancelled_at end
     where organization_id = $1 and id = $2`,
    [organizationId, id, status],
  );
  return getTask(db, organizationId, id);
}

export async function listOpenTaskIdsForEvent(db: Queryable, organizationId: string, eventId: string) {
  const { rows } = await db.query<{ id: string; title: string; status: TaskStatus }>(
    `select id, title, status from tasks where organization_id = $1 and event_id = $2
       and status not in ('COMPLETED', 'CANCELLED') for update`,
    [organizationId, eventId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

interface AssignmentRow {
  id: string;
  task_id: string;
  user_id: string;
  display_name: string | null;
  status: AssignmentStatus;
  assignment_source: AssignmentSource;
  override_reason: string | null;
  assigned_by: string | null;
  assigned_at: Date | string;
  accepted_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
}

const ASSIGNMENT_SELECT = `
  select a.id, a.task_id, a.user_id, p.display_name, a.status, a.assignment_source, a.override_reason,
         a.assigned_by, a.assigned_at, a.accepted_at, a.started_at, a.completed_at, a.cancelled_at
  from task_assignments a
  left join profiles p on p.id = a.user_id`;

const toAssignment = (r: AssignmentRow): TaskAssignment => ({
  id: r.id,
  taskId: r.task_id,
  userId: r.user_id,
  displayName: r.display_name,
  status: r.status,
  assignmentSource: r.assignment_source,
  overrideReason: r.override_reason,
  assignedBy: r.assigned_by,
  assignedAt: iso(r.assigned_at),
  acceptedAt: isoOrNull(r.accepted_at),
  startedAt: isoOrNull(r.started_at),
  completedAt: isoOrNull(r.completed_at),
  cancelledAt: isoOrNull(r.cancelled_at),
});

export async function listAssignmentsForTask(db: Queryable, organizationId: string, taskId: string) {
  const { rows } = await db.query<AssignmentRow>(
    `${ASSIGNMENT_SELECT} where a.organization_id = $1 and a.task_id = $2 order by a.assigned_at, a.id`,
    [organizationId, taskId],
  );
  return rows.map(toAssignment);
}

export async function getAssignment(db: Queryable, organizationId: string, id: string, opts: { forUpdate?: boolean } = {}) {
  const { rows } = await db.query<AssignmentRow>(
    `${ASSIGNMENT_SELECT} where a.organization_id = $1 and a.id = $2${opts.forUpdate ? ' for update of a' : ''}`,
    [organizationId, id],
  );
  return rows[0] ? toAssignment(rows[0]) : null;
}

export async function insertAssignment(
  db: Queryable,
  input: {
    organizationId: string;
    taskId: string;
    userId: string;
    source: AssignmentSource;
    overrideReason: string | null;
    assignedBy: string;
  },
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into task_assignments (organization_id, task_id, user_id, assignment_source, override_reason, assigned_by)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.organizationId, input.taskId, input.userId, input.source, input.overrideReason, input.assignedBy],
  );
  return (await getAssignment(db, input.organizationId, rows[0]!.id))!;
}

export async function setAssignmentStatus(db: Queryable, organizationId: string, id: string, status: AssignmentStatus) {
  await db.query(
    `update task_assignments set status = $3,
       accepted_at = case when $3 = 'ACCEPTED' then now() else accepted_at end,
       started_at = case when $3 = 'IN_PROGRESS' then now() else started_at end,
       completed_at = case when $3 = 'COMPLETED' then now() else completed_at end,
       cancelled_at = case when $3 = 'CANCELLED' then now() else cancelled_at end
     where organization_id = $1 and id = $2`,
    [organizationId, id, status],
  );
  return (await getAssignment(db, organizationId, id))!;
}

/** Cancels every live assignment on the task; returns the affected user ids. */
export async function cancelLiveAssignments(db: Queryable, organizationId: string, taskId: string) {
  const { rows } = await db.query<{ user_id: string }>(
    `update task_assignments set status = 'CANCELLED', cancelled_at = now()
     where organization_id = $1 and task_id = $2 and status in ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     returning user_id`,
    [organizationId, taskId],
  );
  return rows.map((r) => r.user_id);
}

interface ScheduleRow {
  assignment_id: string;
  assignment_status: AssignmentStatus;
  assignment_source: AssignmentSource;
  assigned_at: Date | string;
  accepted_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  task_id: string;
  task_title: string;
  task_status: TaskStatus;
  task_priority: Priority;
  instructions: string | null;
  location_name: string | null;
  completion_deadline: Date | string | null;
  dispatch_start_at: Date | string | null;
  estimated_duration_minutes: number | null;
  event_id: string | null;
  event_title: string | null;
  event_start_at: Date | string | null;
  event_end_at: Date | string | null;
  event_timezone: string | null;
  sort_at: Date | string;
}

export async function listScheduleForUser(
  db: Queryable,
  organizationId: string,
  userId: string,
  opts: { from?: string; to?: string; includeCompleted: boolean },
): Promise<ScheduleItem[]> {
  const { rows } = await db.query<ScheduleRow>(
    `select * from (
       select a.id as assignment_id, a.status as assignment_status, a.assignment_source, a.assigned_at,
              a.accepted_at, a.started_at, a.completed_at,
              t.id as task_id, t.title as task_title, t.status as task_status, t.priority as task_priority,
              t.instructions, l.name as location_name, t.completion_deadline, t.dispatch_start_at,
              t.estimated_duration_minutes,
              e.id as event_id, e.title as event_title, e.start_at as event_start_at, e.end_at as event_end_at,
              e.timezone as event_timezone,
              coalesce(e.start_at, t.dispatch_start_at, t.completion_deadline, a.assigned_at) as sort_at
       from task_assignments a
       join tasks t on t.id = a.task_id
       left join events e on e.id = t.event_id
       left join locations l on l.id = t.location_id
       where a.organization_id = $1 and a.user_id = $2
         and a.status in ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
         and ($3::boolean or a.status <> 'COMPLETED')
         and t.status not in ('DRAFT', 'CANCELLED')
     ) s
     where ($4::timestamptz is null or s.sort_at >= $4::timestamptz)
       and ($5::timestamptz is null or s.sort_at < $5::timestamptz)
     order by s.sort_at, s.assignment_id
     limit 200`,
    [organizationId, userId, opts.includeCompleted, opts.from ?? null, opts.to ?? null],
  );
  return rows.map((r) => ({
    assignment: {
      id: r.assignment_id,
      status: r.assignment_status,
      assignmentSource: r.assignment_source,
      assignedAt: iso(r.assigned_at),
      acceptedAt: isoOrNull(r.accepted_at),
      startedAt: isoOrNull(r.started_at),
      completedAt: isoOrNull(r.completed_at),
    },
    task: {
      id: r.task_id,
      title: r.task_title,
      status: r.task_status,
      priority: r.task_priority,
      instructions: r.instructions,
      locationName: r.location_name,
      completionDeadline: isoOrNull(r.completion_deadline),
      dispatchStartAt: isoOrNull(r.dispatch_start_at),
      estimatedDurationMinutes: r.estimated_duration_minutes,
    },
    event: r.event_id
      ? {
          id: r.event_id,
          title: r.event_title!,
          startAt: iso(r.event_start_at),
          endAt: iso(r.event_end_at),
          timezone: r.event_timezone!,
        }
      : null,
    sortAt: iso(r.sort_at),
  }));
}
