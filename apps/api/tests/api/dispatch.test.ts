import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sweepDispatch } from '../../src/services/dispatch';
import { createTestApp, tokenFor } from '../helpers/test-app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
let ctx: Ctx;
const users: Record<string, { id: string; email: string; token: string }> = {};
const STAFF = ['ana', 'ben', 'cy'] as const;
let base: string;

async function makeUser(key: string, email: string) {
  const id = await ctx.createUser(email);
  users[key] = { id, email, token: await tokenFor(id, email) };
}

const api = (key: string) => {
  const auth = { Authorization: `Bearer ${users[key]!.token}` };
  return {
    get: (url: string) => request(ctx.app).get(`${base}${url}`).set(auth),
    post: (url: string, body?: object) => request(ctx.app).post(`${base}${url}`).set(auth).send(body ?? {}),
  };
};

const keyOf = (userId: string) => Object.keys(users).find((k) => users[k]!.id === userId)!;

async function newTask(body: object = {}) {
  const t = await api('manager').post('/tasks', { title: 'Restock bar', requiredHeadcount: 1, ...body });
  expect(t.status).toBe(201);
  const s = await api('manager').post(`/tasks/${t.body.data.id}/transition`, { status: 'SCHEDULED' });
  expect(s.status).toBe(200);
  return s.body.data.id as string;
}

async function taskDetail(id: string) {
  const res = await api('manager').get(`/tasks/${id}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

const openOffers = async (taskId: string) =>
  ((await taskDetail(taskId)).dispatch.offers as { id: string; userId: string; status: string }[]).filter((o) => o.status === 'OFFERED');

beforeAll(async () => {
  ctx = await createTestApp();
  await makeUser('owner', 'owner@dispatch.test');
  await makeUser('manager', 'manager@dispatch.test');
  for (const k of STAFF) await makeUser(k, `${k}@dispatch.test`);

  const org = await request(ctx.app)
    .post('/api/v1/organizations')
    .set({ Authorization: `Bearer ${users.owner!.token}` })
    .send({ name: 'Dispatch Org', timezone: 'America/New_York' });
  base = `/api/v1/organizations/${org.body.data.id}`;
  for (const [key, role] of [['manager', 'MANAGER'], ...STAFF.map((k) => [k, 'STAFF'] as const)] as const) {
    const inv = await api('owner').post('/invitations', { email: users[key]!.email, role });
    const acc = await request(ctx.app)
      .post('/api/v1/invitations/accept')
      .set({ Authorization: `Bearer ${users[key]!.token}` })
      .send({ token: inv.body.data.token });
    expect(acc.status).toBe(200);
  }
});

afterAll(async () => {
  await ctx.pg.close();
});

describe('dispatch escalation', () => {
  it('escalates when nobody is clocked in', async () => {
    const id = await newTask();
    const res = await api('manager').post(`/tasks/${id}/dispatch`);
    expect(res.status).toBe(200);
    expect(res.body.data.offered).toBe(0);
    const detail = await taskDetail(id);
    expect(detail.status).toBe('NEEDS_MANAGER_ATTENTION');
    expect(detail.dispatch.rounds[0].status).toBe('FAILED');
    expect(detail.dispatch.rounds[0].ineligibleByReason.NOT_AVAILABLE).toBe(3);
  });
});

describe('availability', () => {
  it('records manual clock-in as unverified', async () => {
    const res = await api('ana').post('/me/clock-in');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'AVAILABLE', verification: 'MANUAL', paused: false });
    expect((await api('ana').post('/me/clock-in')).status).toBe(409);
  });

  it('supports breaks and pausing offers', async () => {
    const brk = await api('ana').post('/me/breaks/start', { minutes: 10 });
    expect(brk.status).toBe(200);
    expect(brk.body.data.activeBreak).not.toBeNull();
    expect((await api('ana').post('/me/breaks/start')).status).toBe(409);
    expect((await api('ana').post('/me/breaks/end')).body.data.activeBreak).toBeNull();

    expect((await api('ana').post('/me/pause', { reason: 'Helping a guest' })).body.data.paused).toBe(true);
    expect((await api('ana').post('/me/resume')).body.data.paused).toBe(false);
  });

  it('requires clock-in for breaks and shows a roster to managers only', async () => {
    expect((await api('ben').post('/me/breaks/start')).status).toBe(409);
    await api('ben').post('/me/clock-in');
    await api('cy').post('/me/clock-in');
    const roster = await api('manager').get('/roster');
    expect(roster.status).toBe(200);
    expect(roster.body.data.find((r: { userId: string }) => r.userId === users.ana!.id).status).toBe('AVAILABLE');
    expect((await api('ana').get('/roster')).status).toBe(403);
  });
});

describe('offers', () => {
  it('lets exactly one of several concurrent accepts win a single spot', async () => {
    const id = await newTask({ dispatchPolicy: { overOfferFactor: 3 } });
    expect((await api('ana').post(`/tasks/${id}/dispatch`)).status).toBe(403);
    const start = await api('manager').post(`/tasks/${id}/dispatch`);
    expect(start.status).toBe(200);
    expect(start.body.data.offered).toBe(3);
    expect((await api('manager').post(`/tasks/${id}/dispatch`)).status).toBe(409);

    const offers = await openOffers(id);
    expect((await api('ben').post(`/offers/${offers.find((o) => o.userId === users.ana!.id)!.id}/accept`)).status).toBe(404);

    const results = await Promise.all(offers.map((o) => api(keyOf(o.userId)).post(`/offers/${o.id}/accept`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);

    const detail = await taskDetail(id);
    expect(detail.status).toBe('FULLY_STAFFED');
    expect(detail.assignments).toHaveLength(1);
    expect(detail.dispatch.offers.filter((o: { status: string }) => o.status === 'WITHDRAWN')).toHaveLength(2);
    expect(detail.dispatch.rounds[0].status).toBe('COMPLETED');
  });

  it('lists my open offers', async () => {
    const id = await newTask({ dispatchPolicy: { overOfferFactor: 3 } });
    await api('manager').post(`/tasks/${id}/dispatch`);
    const [offer] = await openOffers(id);
    const who = keyOf(offer!.userId);
    const mine = await api(who).get('/me/offers');
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((o: { task: { id: string } }) => o.task.id === id)).toBe(true);
    const stop = await api('manager').post(`/tasks/${id}/dispatch/stop`);
    expect(stop.status).toBe(200);
    expect((await api(who).get('/me/offers')).body.data.some((o: { task: { id: string } }) => o.task.id === id)).toBe(false);
    expect((await taskDetail(id)).status).toBe('SCHEDULED');
  });

  it('sends the next wave on decline and escalates after the last wave', async () => {
    const id = await newTask({ dispatchPolicy: { overOfferFactor: 1, maxWaves: 2 } });
    await api('manager').post(`/tasks/${id}/dispatch`);

    const [first] = await openOffers(id);
    expect((await api(keyOf(first!.userId)).post(`/offers/${first!.id}/decline`, { reason: 'BUSY' })).status).toBe(200);

    const [second] = await openOffers(id);
    expect(second!.userId).not.toBe(first!.userId);
    await api(keyOf(second!.userId)).post(`/offers/${second!.id}/decline`, { reason: 'BUSY' });

    const detail = await taskDetail(id);
    expect(detail.dispatch.rounds).toHaveLength(2);
    expect(detail.status).toBe('NEEDS_MANAGER_ATTENTION');
  });

  it('expires unanswered offers through the sweep and moves on', async () => {
    const id = await newTask({ dispatchPolicy: { overOfferFactor: 1 } });
    await api('manager').post(`/tasks/${id}/dispatch`);
    const [first] = await openOffers(id);

    expect((await sweepDispatch(ctx.db)).processed).toBe(0);
    await ctx.pg.query(`update task_offers set offered_at = now() - interval '20 minutes', expires_at = now() - interval '1 minute' where id = $1`, [first!.id]);
    expect((await sweepDispatch(ctx.db)).results.next_wave).toBe(1);

    const detail = await taskDetail(id);
    expect(detail.dispatch.offers.find((o: { id: string }) => o.id === first!.id).status).toBe('EXPIRED');
    expect(detail.dispatch.rounds).toHaveLength(2);
    const late = await api(keyOf(first!.userId)).post(`/offers/${first!.id}/accept`);
    expect(late.status).toBe(409);
    await api('manager').post(`/tasks/${id}/dispatch/stop`);
  });

  it('excludes paused members from waves', async () => {
    await api('ana').post('/me/pause');
    await api('ben').post('/me/clock-out');
    const id = await newTask({ dispatchPolicy: { overOfferFactor: 3 } });
    expect((await api('manager').post(`/tasks/${id}/dispatch`)).status).toBe(200);
    const detail = await taskDetail(id);
    expect(detail.dispatch.rounds[0].ineligibleByReason.NOT_AVAILABLE).toBe(2);
    const offered = detail.dispatch.offers.map((o: { userId: string }) => o.userId);
    expect(offered).not.toContain(users.ana!.id);
    expect(offered).not.toContain(users.ben!.id);
  });
});
