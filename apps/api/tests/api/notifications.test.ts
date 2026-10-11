import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPushReceipts, processNotificationJobs, sweepReminders, type PushMessage, type PushSender, type PushTicket } from '../../src/services/notifications';
import { createTestApp, tokenFor } from '../helpers/test-app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
let ctx: Ctx;
const users: Record<string, { id: string; email: string; token: string }> = {};
let base: string;
let orgId: string;

async function makeUser(key: string, email: string) {
  const id = await ctx.createUser(email);
  users[key] = { id, email, token: await tokenFor(id, email) };
}

const api = (key: string, prefix = base) => {
  const auth = { Authorization: `Bearer ${users[key]!.token}` };
  return {
    get: (url: string) => request(ctx.app).get(`${prefix}${url}`).set(auth),
    post: (url: string, body?: object) => request(ctx.app).post(`${prefix}${url}`).set(auth).send(body ?? {}),
    patch: (url: string, body: object) => request(ctx.app).patch(`${prefix}${url}`).set(auth).send(body),
  };
};
const root = (key: string) => api(key, '/api/v1');
const pushToken = (k: string) => `ExponentPushToken[${k}-device]`;

function fakeSender(respond: (m: PushMessage) => PushTicket = () => ({ status: 'ok', id: crypto.randomUUID() })) {
  const sent: PushMessage[] = [];
  let fail = false;
  const sender: PushSender & { sent: PushMessage[]; failNext: () => void } = {
    sent,
    failNext: () => (fail = true),
    async send(messages) {
      if (fail) {
        fail = false;
        throw new Error('network down');
      }
      sent.push(...messages);
      return messages.map(respond);
    },
    async receipts(ids) {
      return Object.fromEntries(ids.map((id) => [id, { status: 'ok' as const }]));
    },
  };
  return sender;
}

async function scheduledTask(body: object = {}) {
  const t = await api('manager').post('/tasks', { title: 'Clear tables', requiredHeadcount: 1, ...body });
  await api('manager').post(`/tasks/${t.body.data.id}/transition`, { status: 'SCHEDULED' });
  return t.body.data.id as string;
}

const jobsFor = async (userId: string) =>
  (await ctx.pg.query<{ notification_type: string; status: string; last_error: string | null }>(
    `select notification_type, status, last_error from notification_jobs where user_id = $1 order by created_at`,
    [userId],
  )).rows;

beforeAll(async () => {
  ctx = await createTestApp();
  await makeUser('owner', 'owner@notify.test');
  await makeUser('manager', 'manager@notify.test');
  await makeUser('ana', 'ana@notify.test');
  await makeUser('ben', 'ben@notify.test');
  const org = await root('owner').post('/organizations', { name: 'Notify Org', timezone: 'America/New_York' });
  orgId = org.body.data.id;
  base = `/api/v1/organizations/${orgId}`;
  for (const [key, role] of [['manager', 'MANAGER'], ['ana', 'STAFF'], ['ben', 'STAFF']] as const) {
    const inv = await api('owner').post('/invitations', { email: users[key]!.email, role });
    expect((await root(key).post('/invitations/accept', { token: inv.body.data.token })).status).toBe(200);
  }
});

afterAll(async () => {
  await ctx.pg.close();
});

describe('devices', () => {
  it('validates and registers Expo push tokens', async () => {
    expect((await root('ana').post('/me/devices', { pushToken: 'not-a-token', platform: 'ios' })).status).toBe(400);
    expect((await root('ana').post(`/me/devices?organizationId=${orgId}`, { pushToken: pushToken('ana'), platform: 'ios' })).status).toBe(204);
    expect((await root('ben').post('/me/devices', { pushToken: pushToken('ben'), platform: 'android' })).status).toBe(204);
    expect((await root('manager').post('/me/devices', { pushToken: pushToken('manager'), platform: 'ios' })).status).toBe(204);
  });
});

describe('producers and delivery', () => {
  it('notifies offered staff in-app and by push, once', async () => {
    await root('ana').post(`/organizations/${orgId}/me/clock-in`);
    const id = await scheduledTask();
    await api('manager').post(`/tasks/${id}/dispatch`);

    const inbox = await api('ana').get('/notifications');
    expect(inbox.status).toBe(200);
    expect(inbox.body.meta.unread).toBe(1);
    expect(inbox.body.data[0]).toMatchObject({ type: 'TASK_OFFER', data: { url: '/home', taskId: id } });

    const sender = fakeSender();
    expect(await processNotificationJobs(ctx.db, sender)).toMatchObject({ claimed: 1, accepted: 1 });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.to).toBe(pushToken('ana'));
    expect((await processNotificationJobs(ctx.db, sender)).claimed).toBe(0);

    const offer = (await api('ana').get('/me/offers')).body.data[0];
    await api('ana').post(`/offers/${offer.id}/accept`);
  });

  it('cancels a queued offer push once the offer is no longer open', async () => {
    const id = await scheduledTask();
    await root('ben').post(`/organizations/${orgId}/me/clock-in`);
    await api('manager').post(`/tasks/${id}/dispatch`);
    await api('manager').post(`/tasks/${id}/dispatch/stop`);
    const sender = fakeSender();
    expect(await processNotificationJobs(ctx.db, sender)).toMatchObject({ claimed: 1, cancelled: 1 });
    expect(sender.sent).toHaveLength(0);
    expect((await jobsFor(users.ben!.id)).at(-1)!.last_error).toBe('OFFER_NO_LONGER_OPEN');
  });

  it('notifies managers on escalation and staff on manual assignment', async () => {
    const id = await scheduledTask({ requiredSkills: ['forklift'] });
    await api('manager').post(`/tasks/${id}/dispatch`);
    const types = (await api('manager').get('/notifications')).body.data.map((n: { type: string }) => n.type);
    expect(types).toContain('ESCALATION');
    expect((await api('owner').get('/notifications')).body.data[0].type).toBe('ESCALATION');

    await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ben!.id });
    expect((await api('ben').get('/notifications')).body.data[0]).toMatchObject({ type: 'TASK_ASSIGNED', data: { url: `/tasks/${id}` } });
    await processNotificationJobs(ctx.db, fakeSender());
  });

  it('respects push opt-out but keeps the in-app notification', async () => {
    expect((await root('ben').patch('/me', { notificationPreferences: { TASK_ASSIGNED: false } })).status).toBe(200);
    const id = await scheduledTask();
    await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ben!.id });
    expect((await jobsFor(users.ben!.id)).at(-1)).toMatchObject({ status: 'CANCELLED', last_error: 'OPTED_OUT' });
    expect((await api('ben').get('/notifications')).body.data[0].type).toBe('TASK_ASSIGNED');
  });

  it('retries transport failures and invalidates unregistered devices', async () => {
    const id = await scheduledTask();
    await root('ana').post(`/organizations/${orgId}/me/clock-out`);
    await root('ana').post(`/organizations/${orgId}/me/clock-in`);
    await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ana!.id });

    const sender = fakeSender(() => ({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }));
    sender.failNext();
    expect(await processNotificationJobs(ctx.db, sender)).toMatchObject({ claimed: 1, retried: 1 });
    await ctx.pg.query(`update notification_jobs set next_retry_at = now() where status = 'QUEUED'`);
    expect(await processNotificationJobs(ctx.db, sender)).toMatchObject({ claimed: 1, cancelled: 1 });

    const { rows } = await ctx.pg.query<{ status: string }>(`select status from notification_devices where push_token = $1`, [pushToken('ana')]);
    expect(rows[0]!.status).toBe('INVALID');
  });

  it('confirms delivery from receipts', async () => {
    await ctx.pg.query(`update notification_logs set sent_at = now() - interval '20 minutes' where status = 'ACCEPTED'`);
    expect((await checkPushReceipts(ctx.db, fakeSender())).checked).toBeGreaterThan(0);
    const { rows } = await ctx.pg.query<{ n: number }>(`select count(*)::int as n from notification_logs where status = 'DELIVERED'`);
    expect(rows[0]!.n).toBeGreaterThan(0);
  });
});

describe('changes and reminders', () => {
  const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const latest = async (key: string) => (await api(key).get('/notifications')).body.data[0];

  it('tells assignees about schedule changes, but not the editor', async () => {
    const id = await scheduledTask();
    await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ana!.id });
    const edit = await api('manager').patch(`/tasks/${id}`, { instructions: 'Use the side door' });
    expect(edit.status).toBe(200);
    expect(await latest('ana')).toMatchObject({ type: 'SCHEDULE_CHANGE', body: 'Clear tables: Instructions changed.' });
    expect((await latest('manager')).type).not.toBe('SCHEDULE_CHANGE');

    await api('manager').patch(`/tasks/${id}`, { title: 'Clear all tables' });
    expect((await latest('ana')).type).toBe('SCHEDULE_CHANGE');
    expect((await api('ana').get('/notifications')).body.data.filter((n: { type: string }) => n.type === 'SCHEDULE_CHANGE')).toHaveLength(1);
  });

  it('tells assignees when a task is cancelled', async () => {
    const id = await scheduledTask();
    await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ana!.id });
    await api('manager').post(`/tasks/${id}/transition`, { status: 'CANCELLED' });
    expect(await latest('ana')).toMatchObject({ type: 'TASK_CANCELLED', data: { taskId: id } });
  });

  it('sends one reminder per start time and a fresh one after rescheduling', async () => {
    const id = await scheduledTask({ dispatchStartAt: inMinutes(20) });
    await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ana!.id });
    const before = (await jobsFor(users.ana!.id)).length;

    expect(await sweepReminders(ctx.db, 30)).toMatchObject({ created: 1 });
    expect((await latest('ana')).type).toBe('ASSIGNMENT_REMINDER');
    expect(await sweepReminders(ctx.db, 30)).toMatchObject({ created: 0 });

    await api('manager').patch(`/tasks/${id}`, { dispatchStartAt: inMinutes(25) });
    expect(await sweepReminders(ctx.db, 30)).toMatchObject({ created: 1 });
    expect((await jobsFor(users.ana!.id)).length).toBe(before + 3); // reminder, change notice, new reminder
  });

  it('drops a queued reminder if the assignment is cancelled before sending', async () => {
    const id = await scheduledTask({ dispatchStartAt: inMinutes(10) });
    const a = await api('manager').post(`/tasks/${id}/assignments`, { userId: users.ben!.id });
    await processNotificationJobs(ctx.db, fakeSender());
    await sweepReminders(ctx.db, 30);
    await api('manager').post(`/assignments/${a.body.data.id}/cancel`);
    await root('ben').post('/me/devices', { pushToken: pushToken('ben'), platform: 'android' });
    const sender = fakeSender();
    await processNotificationJobs(ctx.db, sender);
    expect(sender.sent).toHaveLength(0);
  });
});

describe('inbox', () => {
  it('marks read individually and in bulk, scoped to the owner', async () => {
    const list = await api('manager').get('/notifications');
    const first = list.body.data[0].id;
    expect((await api('ben').post(`/notifications/${first}/read`)).status).toBe(404);
    expect((await api('manager').post(`/notifications/${first}/read`)).status).toBe(200);
    await api('manager').post('/notifications/read-all');
    expect((await api('manager').get('/notifications')).body.meta.unread).toBe(0);
  });

  it('revokes a device on sign-out', async () => {
    expect((await root('ben').post('/me/devices/revoke', { pushToken: pushToken('ben') })).status).toBe(204);
    const { rows } = await ctx.pg.query<{ status: string }>(`select status from notification_devices where push_token = $1`, [pushToken('ben')]);
    expect(rows[0]!.status).toBe('REVOKED');
  });
});
