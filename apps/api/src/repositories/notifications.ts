import type { InAppNotification, NotificationType, RegisterDeviceInput } from '@teampilot/shared';
import type { Queryable } from '../db/types';

export async function upsertDevice(db: Queryable, userId: string, organizationId: string | null, input: RegisterDeviceInput) {
  // A token moves with the physical device, so re-registration reassigns it to the signed-in user.
  await db.query(
    `insert into notification_devices (user_id, organization_id, platform, push_token, installation_identifier)
     values ($1, $2, $3, $4, $5)
     on conflict (push_token) do update set
       user_id = excluded.user_id, organization_id = excluded.organization_id, platform = excluded.platform,
       installation_identifier = excluded.installation_identifier, status = 'ACTIVE', last_seen_at = now(), updated_at = now()`,
    [userId, organizationId, input.platform, input.pushToken, input.installationIdentifier ?? null],
  );
}

export async function revokeDevice(db: Queryable, userId: string, pushToken: string) {
  const { rowCount } = await db.query(
    `update notification_devices set status = 'REVOKED', updated_at = now() where user_id = $1 and push_token = $2`,
    [userId, pushToken],
  );
  return rowCount > 0;
}

export async function markDevicesInvalid(db: Queryable, pushTokens: string[]) {
  if (!pushTokens.length) return;
  await db.query(`update notification_devices set status = 'INVALID', updated_at = now() where push_token = any($1::text[])`, [pushTokens]);
}

export async function listActiveTokens(db: Queryable, userId: string) {
  const { rows } = await db.query<{ push_token: string }>(
    `select push_token from notification_devices where user_id = $1 and status = 'ACTIVE'`,
    [userId],
  );
  return rows.map((r) => r.push_token);
}

export interface NotificationInput {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: InAppNotification['data'];
  taskId?: string;
  offerId?: string;
  assignmentId?: string;
  /** Unique per logical notification so retried transactions never double-send. */
  idempotencyKey: string;
}

/**
 * Transactional outbox: the in-app row and the push job are written in the caller's transaction, so a
 * notification exists if and only if the change that caused it committed. The job row doubles as the
 * idempotency record: a repeated key writes nothing, and a push the user opted out of is stored as CANCELLED.
 */
export async function enqueueNotification(db: Queryable, n: NotificationInput) {
  const { rows } = await db.query<{ id: string }>(
    `insert into notification_jobs (organization_id, task_id, assignment_id, offer_id, user_id, notification_type, payload,
                                    scheduled_at, idempotency_key, status, last_error, cancelled_at)
     select $1, $2, $3, $4, $5, $6, $7, now(), $8,
            case when opted_in then 'QUEUED' else 'CANCELLED' end,
            case when opted_in then null else 'OPTED_OUT' end,
            case when opted_in then null else now() end
     from (select coalesce((select (notification_preferences ->> $6)::boolean from profiles where id = $5), true) as opted_in) p
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      n.organizationId,
      n.taskId ?? null,
      n.assignmentId ?? null,
      n.offerId ?? null,
      n.userId,
      n.type,
      JSON.stringify({ title: n.title, body: n.body, data: n.data }),
      n.idempotencyKey,
    ],
  );
  if (!rows[0]) return null;
  await db.query(
    `insert into in_app_notifications (organization_id, user_id, notification_type, title, body, data)
     values ($1, $2, $3, $4, $5, $6)`,
    [n.organizationId, n.userId, n.type, n.title, n.body, JSON.stringify(n.data)],
  );
  return rows[0].id;
}

/** People currently on a task, or on any open task of an event. */
export async function listLiveAssignees(db: Queryable, organizationId: string, scope: { taskId: string } | { eventId: string }) {
  const { rows } = await db.query<{ task_id: string; title: string; user_id: string }>(
    `select t.id as task_id, t.title, a.user_id from task_assignments a join tasks t on t.id = a.task_id
     where a.organization_id = $1 and a.status in ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
       and t.status not in ('COMPLETED', 'CANCELLED')
       and ${'taskId' in scope ? 't.id = $2' : 't.event_id = $2'}`,
    [organizationId, 'taskId' in scope ? scope.taskId : scope.eventId],
  );
  return rows.map((r) => ({ taskId: r.task_id, title: r.title, userId: r.user_id }));
}

export interface DueReminder {
  organizationId: string;
  assignmentId: string;
  userId: string;
  taskId: string;
  title: string;
  startAt: string;
  timezone: string;
  locationName: string | null;
}

/**
 * Live assignments whose task starts within the lead window and that have no reminder for this start time yet.
 * Keying on the start time means a rescheduled task gets a fresh reminder.
 */
export async function findDueReminders(db: Queryable, leadMinutes: number, limit = 200): Promise<DueReminder[]> {
  const { rows } = await db.query<{
    organization_id: string;
    assignment_id: string;
    user_id: string;
    task_id: string;
    title: string;
    start_at: Date | string;
    timezone: string;
    location_name: string | null;
  }>(
    `select * from (
       select a.organization_id, a.id as assignment_id, a.user_id, t.id as task_id, t.title,
              coalesce(e.start_at, t.dispatch_start_at) as start_at,
              coalesce(e.timezone, o.timezone) as timezone,
              coalesce(tl.name, el.name) as location_name
       from task_assignments a
       join tasks t on t.id = a.task_id
       join organizations o on o.id = a.organization_id
       left join events e on e.id = t.event_id
       left join locations tl on tl.id = t.location_id
       left join locations el on el.id = e.location_id
       where a.status in ('ASSIGNED', 'ACCEPTED') and t.status not in ('CANCELLED', 'COMPLETED')
     ) r
     where r.start_at > now() and r.start_at <= now() + make_interval(mins => $1::int)
       and not exists (select 1 from notification_jobs j
                       where j.idempotency_key = 'reminder:' || r.assignment_id || ':' || floor(extract(epoch from r.start_at))::bigint)
     limit $2`,
    [leadMinutes, limit],
  );
  return rows.map((r) => ({
    organizationId: r.organization_id,
    assignmentId: r.assignment_id,
    userId: r.user_id,
    taskId: r.task_id,
    title: r.title,
    startAt: new Date(r.start_at).toISOString(),
    timezone: r.timezone,
    locationName: r.location_name,
  }));
}

export const reminderKey = (assignmentId: string, startAt: string) => `reminder:${assignmentId}:${Math.floor(Date.parse(startAt) / 1000)}`;

export async function listManagerIds(db: Queryable, organizationId: string) {
  const { rows } = await db.query<{ user_id: string }>(
    `select user_id from memberships where organization_id = $1 and status = 'ACTIVE' and role in ('OWNER', 'ADMIN', 'MANAGER')`,
    [organizationId],
  );
  return rows.map((r) => r.user_id);
}

interface InAppRow {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  data: InAppNotification['data'];
  read_at: Date | string | null;
  created_at: Date | string;
}
const iso = (v: Date | string) => new Date(v).toISOString();

export async function listInApp(db: Queryable, organizationId: string, userId: string, limit = 50) {
  const { rows } = await db.query<InAppRow>(
    `select id, notification_type, title, body, data, read_at, created_at from in_app_notifications
     where organization_id = $1 and user_id = $2 order by created_at desc limit $3`,
    [organizationId, userId, limit],
  );
  return rows.map(
    (r): InAppNotification => ({
      id: r.id,
      type: r.notification_type,
      title: r.title,
      body: r.body,
      data: r.data ?? {},
      readAt: r.read_at ? iso(r.read_at) : null,
      createdAt: iso(r.created_at),
    }),
  );
}

export async function countUnread(db: Queryable, organizationId: string, userId: string) {
  const { rows } = await db.query<{ n: number | string }>(
    `select count(*) as n from in_app_notifications where organization_id = $1 and user_id = $2 and read_at is null`,
    [organizationId, userId],
  );
  return Number(rows[0]!.n);
}

/** Marks one notification (or all when id is omitted) as read. */
export async function markRead(db: Queryable, organizationId: string, userId: string, id?: string) {
  const { rowCount } = await db.query(
    `update in_app_notifications set read_at = now()
     where organization_id = $1 and user_id = $2 and read_at is null and ($3::uuid is null or id = $3)`,
    [organizationId, userId, id ?? null],
  );
  return rowCount;
}

export interface ClaimedJob {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  payload: { title: string; body: string; data: Record<string, unknown> };
  attemptCount: number;
  /** False when the job refers to an offer that can no longer be accepted. */
  stillRelevant: boolean;
}

/** Claims due jobs with SKIP LOCKED so concurrent workers never send the same job twice. */
export async function claimDueJobs(db: Queryable, limit = 50): Promise<ClaimedJob[]> {
  // Jobs stuck in SENDING (worker crashed mid-send) are retried after five minutes.
  await db.query(
    `update notification_jobs set status = 'QUEUED', updated_at = now()
     where status = 'SENDING' and updated_at < now() - interval '5 minutes'`,
  );
  const { rows } = await db.query<{
    id: string;
    organization_id: string;
    user_id: string;
    notification_type: string;
    payload: ClaimedJob['payload'];
    attempt_count: number;
    still_relevant: boolean;
  }>(
    `with due as (
       select id from notification_jobs
       where status = 'QUEUED' and scheduled_at <= now() and (next_retry_at is null or next_retry_at <= now())
       order by scheduled_at limit $1
       for update skip locked
     )
     update notification_jobs j set status = 'SENDING', attempt_count = j.attempt_count + 1, updated_at = now()
     from due where j.id = due.id
     returning j.id, j.organization_id, j.user_id, j.notification_type, j.payload, j.attempt_count,
       (j.offer_id is null or exists (select 1 from task_offers o where o.id = j.offer_id
                                      and o.offer_status = 'OFFERED' and o.expires_at > now()))
       and (j.assignment_id is null or exists (select 1 from task_assignments a where a.id = j.assignment_id
                                               and a.status in ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'))) as still_relevant`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    type: r.notification_type,
    payload: r.payload,
    attemptCount: r.attempt_count,
    stillRelevant: r.still_relevant,
  }));
}

export async function finishJob(
  db: Queryable,
  id: string,
  status: 'ACCEPTED' | 'FAILED' | 'CANCELLED',
  error: string | null = null,
) {
  await db.query(
    `update notification_jobs set status = $2, last_error = $3, next_retry_at = null,
       cancelled_at = case when $2 = 'CANCELLED' then now() else cancelled_at end, updated_at = now()
     where id = $1`,
    [id, status, error],
  );
}

export async function retryJob(db: Queryable, id: string, delayMs: number, error: string) {
  await db.query(
    `update notification_jobs set status = 'QUEUED', last_error = $3,
       next_retry_at = now() + make_interval(secs => $2::double precision / 1000), updated_at = now()
     where id = $1`,
    [id, delayMs, error],
  );
}

export async function insertLog(
  db: Queryable,
  log: { organizationId: string; jobId: string; userId: string; status: 'ACCEPTED' | 'FAILED'; ticketId?: string; errorCode?: string },
) {
  await db.query(
    `insert into notification_logs (organization_id, notification_job_id, user_id, channel, provider_message_id, status, error_code, sent_at)
     values ($1, $2, $3, 'PUSH', $4, $5, $6, now())`,
    [log.organizationId, log.jobId, log.userId, log.ticketId ?? null, log.status, log.errorCode ?? null],
  );
}

/** Push tickets old enough for Expo to have a receipt, but not so old that the receipt has been discarded. */
export async function listPendingReceipts(db: Queryable, limit = 300) {
  const { rows } = await db.query<{ id: string; provider_message_id: string }>(
    `select id, provider_message_id from notification_logs
     where channel = 'PUSH' and status = 'ACCEPTED' and provider_message_id is not null and delivered_at is null
       and sent_at < now() - interval '15 minutes' and sent_at > now() - interval '24 hours'
     order by sent_at limit $1`,
    [limit],
  );
  return rows.map((r) => ({ logId: r.id, ticketId: r.provider_message_id }));
}

export async function settleReceipt(db: Queryable, logId: string, ok: boolean, errorCode: string | null) {
  await db.query(
    `update notification_logs set status = $2, error_code = $3, delivered_at = case when $2 = 'DELIVERED' then now() else null end
     where id = $1`,
    [logId, ok ? 'DELIVERED' : 'FAILED', errorCode],
  );
}
