import type { Task } from '@teampilot/shared';
import type { Db, Queryable } from '../db/types';
import {
  claimDueJobs,
  enqueueNotification,
  finishJob,
  insertLog,
  listActiveTokens,
  listManagerIds,
  listPendingReceipts,
  markDevicesInvalid,
  retryJob,
  settleReceipt,
} from '../repositories/notifications';

// ---- Producers (called inside the transaction that caused the event) ----

export async function notifyOffers(tx: Queryable, task: Task, offers: Array<{ id: string; userId: string }>) {
  for (const o of offers) {
    await enqueueNotification(tx, {
      organizationId: task.organizationId,
      userId: o.userId,
      type: 'TASK_OFFER',
      title: 'New task offer',
      body: `${task.title}. First to accept gets it; respond within ${task.offerResponseWindowMinutes} min.`,
      data: { url: '/home', taskId: task.id, offerId: o.id },
      taskId: task.id,
      offerId: o.id,
      idempotencyKey: `offer:${o.id}`,
    });
  }
}

export async function notifyAssignment(tx: Queryable, task: Task, userId: string, assignmentId: string) {
  await enqueueNotification(tx, {
    organizationId: task.organizationId,
    userId,
    type: 'TASK_ASSIGNED',
    title: 'You have been assigned a task',
    body: task.title,
    data: { url: `/tasks/${task.id}`, taskId: task.id },
    taskId: task.id,
    assignmentId,
    idempotencyKey: `assignment:${assignmentId}`,
  });
}

const ESCALATION_TEXT: Record<string, string> = {
  NO_ELIGIBLE_CANDIDATES: 'nobody is available or eligible',
  MAX_WAVES_REACHED: 'all dispatch waves ran out',
};

export async function notifyEscalation(tx: Queryable, task: Task, reason: string, escalationId: string) {
  for (const userId of await listManagerIds(tx, task.organizationId)) {
    await enqueueNotification(tx, {
      organizationId: task.organizationId,
      userId,
      type: 'ESCALATION',
      title: 'Task needs attention',
      body: `${task.title}: ${ESCALATION_TEXT[reason] ?? reason.toLowerCase()} (${task.staffing.staffed}/${task.requiredHeadcount} staffed).`,
      data: { url: `/tasks/${task.id}`, taskId: task.id },
      taskId: task.id,
      idempotencyKey: `escalation:${escalationId}:${userId}`,
    });
  }
}

// ---- Delivery (worker) ----

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
}
export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
export type PushReceipt = { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } };

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  receipts(ids: string[]): Promise<Record<string, PushReceipt>>;
}

const EXPO_API = 'https://exp.host/--/api/v2/push';

/** Expo push service client. The access token is only required when "enhanced push security" is on. */
export function createExpoSender(accessToken?: string, fetchImpl: typeof fetch = fetch): PushSender {
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchImpl(`${EXPO_API}/${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Expo push ${path} failed with HTTP ${res.status}`);
    return ((await res.json()) as { data: T }).data;
  };
  return {
    send: (messages) => post<PushTicket[]>('send', messages),
    receipts: (ids) => post<Record<string, PushReceipt>>('getReceipts', { ids }),
  };
}

const MAX_ATTEMPTS = 5;
const RETRYABLE = new Set(['MessageRateExceeded', 'ExpoError']);
const retryDelay = (attempt: number) => Math.min(5 * 60_000, 2_000 * 2 ** Math.max(0, attempt - 1));

/** Sends due push jobs. In-app notifications already exist, so a failed push never loses the message. */
export async function processNotificationJobs(db: Db, sender: PushSender, limit = 50) {
  const jobs = await db.transaction((tx) => claimDueJobs(tx, limit));
  const counts = { claimed: jobs.length, accepted: 0, cancelled: 0, retried: 0, failed: 0 };

  for (const job of jobs) {
    if (!job.stillRelevant) {
      await finishJob(db, job.id, 'CANCELLED', 'OFFER_NO_LONGER_OPEN');
      counts.cancelled++;
      continue;
    }
    const tokens = await listActiveTokens(db, job.userId);
    if (!tokens.length) {
      await finishJob(db, job.id, 'CANCELLED', 'NO_ACTIVE_DEVICES');
      counts.cancelled++;
      continue;
    }

    let tickets: PushTicket[];
    try {
      tickets = await sender.send(
        tokens.map((to) => ({ to, title: job.payload.title, body: job.payload.body, data: job.payload.data, sound: 'default', priority: 'high' })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attemptCount >= MAX_ATTEMPTS) {
        await finishJob(db, job.id, 'FAILED', message);
        counts.failed++;
      } else {
        await retryJob(db, job.id, retryDelay(job.attemptCount), message);
        counts.retried++;
      }
      continue;
    }

    const invalid: string[] = [];
    let ok = 0;
    let retryable = false;
    for (const [i, t] of tickets.entries()) {
      const code = t.status === 'error' ? (t.details?.error ?? 'Unknown') : undefined;
      if (code === 'DeviceNotRegistered') invalid.push(tokens[i]!);
      if (code && RETRYABLE.has(code)) retryable = true;
      if (t.status === 'ok') ok++;
      await insertLog(db, {
        organizationId: job.organizationId,
        jobId: job.id,
        userId: job.userId,
        status: t.status === 'ok' ? 'ACCEPTED' : 'FAILED',
        ticketId: t.status === 'ok' ? t.id : undefined,
        errorCode: code,
      });
    }
    await markDevicesInvalid(db, invalid);

    if (ok > 0) {
      await finishJob(db, job.id, 'ACCEPTED');
      counts.accepted++;
    } else if (retryable && job.attemptCount < MAX_ATTEMPTS) {
      await retryJob(db, job.id, retryDelay(job.attemptCount), 'RETRYABLE_TICKET_ERROR');
      counts.retried++;
    } else {
      await finishJob(db, job.id, invalid.length === tokens.length ? 'CANCELLED' : 'FAILED', 'ALL_TICKETS_FAILED');
      counts[invalid.length === tokens.length ? 'cancelled' : 'failed']++;
    }
  }
  return counts;
}

/** Confirms delivery with Expo receipts (available ~15 minutes after sending). */
export async function checkPushReceipts(db: Db, sender: PushSender) {
  const pending = await listPendingReceipts(db);
  if (!pending.length) return { checked: 0 };
  const receipts = await sender.receipts(pending.map((p) => p.ticketId));
  let checked = 0;
  for (const p of pending) {
    const r = receipts[p.ticketId];
    if (!r) continue;
    await settleReceipt(db, p.logId, r.status === 'ok', r.status === 'error' ? (r.details?.error ?? 'Unknown') : null);
    checked++;
  }
  return { checked };
}
