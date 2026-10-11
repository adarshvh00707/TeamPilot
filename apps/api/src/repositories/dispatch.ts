import type { DispatchRoundSummary, MyOffer, Offer, OfferStatus, Priority } from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, isoOrNull } from '../utils/pagination';

interface OfferRow {
  id: string;
  task_id: string;
  user_id: string;
  display_name: string | null;
  offer_status: OfferStatus;
  offered_at: Date | string;
  expires_at: Date | string;
  responded_at: Date | string | null;
  response_reason: string | null;
  round_number: number | null;
}

const OFFER_SELECT = `
  select o.id, o.task_id, o.user_id, p.display_name, o.offer_status, o.offered_at, o.expires_at, o.responded_at,
         o.response_reason, r.round_number
  from task_offers o
  left join profiles p on p.id = o.user_id
  left join dispatch_rounds r on r.id = o.dispatch_round_id`;

const toOffer = (r: OfferRow): Offer => ({
  id: r.id,
  taskId: r.task_id,
  userId: r.user_id,
  displayName: r.display_name,
  status: r.offer_status,
  offeredAt: iso(r.offered_at),
  expiresAt: iso(r.expires_at),
  respondedAt: isoOrNull(r.responded_at),
  responseReason: r.response_reason,
  roundNumber: r.round_number,
});

export async function getOffer(db: Queryable, organizationId: string, id: string, opts: { forUpdate?: boolean } = {}) {
  const { rows } = await db.query<OfferRow>(
    `${OFFER_SELECT} where o.organization_id = $1 and o.id = $2${opts.forUpdate ? ' for update of o' : ''}`,
    [organizationId, id],
  );
  return rows[0] ? toOffer(rows[0]) : null;
}

export async function listOffersForTask(db: Queryable, organizationId: string, taskId: string) {
  const { rows } = await db.query<OfferRow>(
    `${OFFER_SELECT} where o.organization_id = $1 and o.task_id = $2 order by o.offered_at desc, o.id`,
    [organizationId, taskId],
  );
  return rows.map(toOffer);
}

interface MyOfferRow extends OfferRow {
  title: string;
  priority: Priority;
  location_name: string | null;
  estimated_duration_minutes: number | null;
  instructions: string | null;
  completion_deadline: Date | string | null;
  event_id: string | null;
  event_title: string | null;
  event_start_at: Date | string | null;
  event_end_at: Date | string | null;
  event_timezone: string | null;
}

export async function listOpenOffersForUser(db: Queryable, organizationId: string, userId: string): Promise<MyOffer[]> {
  const { rows } = await db.query<MyOfferRow>(
    `select o.id, o.task_id, o.user_id, p.display_name, o.offer_status, o.offered_at, o.expires_at, o.responded_at,
            o.response_reason, r.round_number,
            t.title, t.priority, l.name as location_name, t.estimated_duration_minutes, t.instructions, t.completion_deadline,
            e.id as event_id, e.title as event_title, e.start_at as event_start_at, e.end_at as event_end_at, e.timezone as event_timezone
     from task_offers o
     join tasks t on t.id = o.task_id
     left join profiles p on p.id = o.user_id
     left join dispatch_rounds r on r.id = o.dispatch_round_id
     left join locations l on l.id = t.location_id
     left join events e on e.id = t.event_id
     where o.organization_id = $1 and o.user_id = $2 and o.offer_status = 'OFFERED' and o.expires_at > now()
     order by o.expires_at`,
    [organizationId, userId],
  );
  return rows.map((r) => ({
    ...toOffer(r),
    task: {
      id: r.task_id,
      title: r.title,
      priority: r.priority,
      locationName: r.location_name,
      estimatedDurationMinutes: r.estimated_duration_minutes,
      instructions: r.instructions,
      completionDeadline: isoOrNull(r.completion_deadline),
    },
    event: r.event_id
      ? { id: r.event_id, title: r.event_title!, startAt: iso(r.event_start_at), endAt: iso(r.event_end_at), timezone: r.event_timezone! }
      : null,
  }));
}

export async function insertOffers(
  db: Queryable,
  input: { organizationId: string; taskId: string; roundId: string; roundNumber: number; userIds: string[]; windowMinutes: number },
) {
  for (const userId of input.userIds) {
    await db.query(
      `insert into task_offers (organization_id, task_id, user_id, expires_at, dispatch_round_id, idempotency_key)
       values ($1, $2, $3, now() + make_interval(mins => $4::int), $5, $6)
       on conflict (idempotency_key) do nothing`,
      [input.organizationId, input.taskId, userId, input.windowMinutes, input.roundId, `${input.taskId}:${input.roundNumber}:${userId}`],
    );
  }
}

export async function setOfferStatus(db: Queryable, id: string, status: OfferStatus, reason: string) {
  await db.query(
    `update task_offers set offer_status = $2, response_reason = $3, responded_at = now()
     where id = $1 and offer_status = 'OFFERED'`,
    [id, status, reason],
  );
}

/** Withdraws every open offer on a task; returns affected user ids. */
export async function withdrawOpenOffers(db: Queryable, organizationId: string, taskId: string, reason: string) {
  const { rows } = await db.query<{ user_id: string }>(
    `update task_offers set offer_status = 'WITHDRAWN', response_reason = $3, responded_at = now()
     where organization_id = $1 and task_id = $2 and offer_status = 'OFFERED'
     returning user_id`,
    [organizationId, taskId, reason],
  );
  return rows.map((r) => r.user_id);
}

export async function expireDueOffers(db: Queryable, roundId: string) {
  await db.query(
    `update task_offers set offer_status = 'EXPIRED', response_reason = 'EXPIRED', responded_at = now()
     where dispatch_round_id = $1 and offer_status = 'OFFERED' and expires_at <= now()`,
    [roundId],
  );
}

export async function countOpenOffersInRound(db: Queryable, roundId: string) {
  const { rows } = await db.query<{ n: number | string }>(
    `select count(*) as n from task_offers where dispatch_round_id = $1 and offer_status = 'OFFERED'`,
    [roundId],
  );
  return Number(rows[0]!.n);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

interface RoundRow {
  id: string;
  round_number: number;
  round_status: DispatchRoundSummary['status'];
  started_at: Date | string;
  completed_at: Date | string | null;
  required_positions: number;
  eligible_candidates_count: number;
  selected_candidates: string[];
  decision_metadata: { ineligibleByReason?: Record<string, number> } | null;
}

const toRound = (r: RoundRow): DispatchRoundSummary => ({
  id: r.id,
  roundNumber: r.round_number,
  status: r.round_status,
  startedAt: iso(r.started_at),
  completedAt: isoOrNull(r.completed_at),
  requiredPositions: r.required_positions,
  eligibleCandidatesCount: r.eligible_candidates_count,
  selectedCount: r.selected_candidates?.length ?? 0,
  ineligibleByReason: r.decision_metadata?.ineligibleByReason ?? {},
});

export async function listRoundsForTask(db: Queryable, organizationId: string, taskId: string) {
  const { rows } = await db.query<RoundRow>(
    `select * from dispatch_rounds where organization_id = $1 and task_id = $2 order by round_number desc`,
    [organizationId, taskId],
  );
  return rows.map(toRound);
}

export async function getRunningRound(db: Queryable, taskId: string) {
  const { rows } = await db.query<RoundRow>(
    `select * from dispatch_rounds where task_id = $1 and round_status = 'RUNNING' order by round_number desc limit 1`,
    [taskId],
  );
  return rows[0] ? toRound(rows[0]) : null;
}

export async function nextRoundNumber(db: Queryable, taskId: string) {
  const { rows } = await db.query<{ n: number | string }>(
    `select coalesce(max(round_number), 0) + 1 as n from dispatch_rounds where task_id = $1`,
    [taskId],
  );
  return Number(rows[0]!.n);
}

export async function insertRound(
  db: Queryable,
  input: {
    organizationId: string;
    taskId: string;
    roundNumber: number;
    requiredPositions: number;
    eligibleCount: number;
    selected: string[];
    metadata: Record<string, unknown>;
    status: 'RUNNING' | 'FAILED';
  },
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into dispatch_rounds (organization_id, task_id, round_number, round_status, required_positions,
                                  eligible_candidates_count, selected_candidates, decision_metadata, completed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, case when $4 = 'FAILED' then now() end) returning id`,
    [
      input.organizationId,
      input.taskId,
      input.roundNumber,
      input.status,
      input.requiredPositions,
      input.eligibleCount,
      input.selected,
      JSON.stringify(input.metadata),
    ],
  );
  return rows[0]!.id;
}

export async function finishRound(db: Queryable, roundId: string, status: 'COMPLETED' | 'CANCELLED') {
  await db.query(
    `update dispatch_rounds set round_status = $2, completed_at = now() where id = $1 and round_status = 'RUNNING'`,
    [roundId, status],
  );
}

export async function cancelRunningRounds(db: Queryable, taskId: string) {
  await db.query(
    `update dispatch_rounds set round_status = 'CANCELLED', completed_at = now() where task_id = $1 and round_status = 'RUNNING'`,
    [taskId],
  );
}

/** Running rounds whose offers have all been answered or have passed their expiry. */
export async function findSettledRounds(db: Queryable, limit = 100) {
  const { rows } = await db.query<{ organization_id: string; task_id: string }>(
    `select r.organization_id, r.task_id from dispatch_rounds r
     where r.round_status = 'RUNNING'
       and not exists (select 1 from task_offers o
                       where o.dispatch_round_id = r.id and o.offer_status = 'OFFERED' and o.expires_at > now())
     order by r.started_at
     limit $1`,
    [limit],
  );
  return rows.map((r) => ({ organizationId: r.organization_id, taskId: r.task_id }));
}
