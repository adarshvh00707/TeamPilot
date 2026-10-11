import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, tokenFor } from '../helpers/test-app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
let ctx: Ctx;
const users: Record<string, { id: string; email: string; token: string }> = {};
let orgId: string;
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
    patch: (url: string, body: object) => request(ctx.app).patch(`${base}${url}`).set(auth).send(body),
  };
};

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function newScheduledTask(body: object = {}) {
  const t = await api('manager').post('/tasks', { title: 'Reset chairs', requiredHeadcount: 2, ...body });
  expect(t.status).toBe(201);
  const s = await api('manager').post(`/tasks/${t.body.data.id}/transition`, { status: 'SCHEDULED' });
  expect(s.status).toBe(200);
  return s.body.data as { id: string; version: number };
}

beforeAll(async () => {
  ctx = await createTestApp();
  await makeUser('owner', 'owner@work.test');
  await makeUser('manager', 'manager@work.test');
  await makeUser('ana', 'ana@work.test');
  await makeUser('ben', 'ben@work.test');
  await makeUser('cy', 'cy@work.test');
  await makeUser('outsider', 'outsider@work.test');

  const org = await request(ctx.app)
    .post('/api/v1/organizations')
    .set({ Authorization: `Bearer ${users.owner!.token}` })
    .send({ name: 'Work Org', timezone: 'America/New_York' });
  orgId = org.body.data.id;
  base = `/api/v1/organizations/${orgId}`;
  for (const [key, role] of [['manager', 'MANAGER'], ['ana', 'STAFF'], ['ben', 'STAFF'], ['cy', 'STAFF']] as const) {
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

describe('events', () => {
  let eventId: string;

  it('validates time ranges and timezones', async () => {
    const bad = await api('manager').post('/events', { title: 'X', startAt: inHours(2), endAt: inHours(1), timezone: 'America/New_York' });
    expect(bad.status).toBe(400);
    const tz = await api('manager').post('/events', { title: 'X', startAt: inHours(1), endAt: inHours(2), timezone: 'Mars/Base' });
    expect(tz.status).toBe(400);
  });

  it('lets managers create drafts that staff cannot see', async () => {
    const res = await api('manager').post('/events', {
      title: 'Gala dinner',
      startAt: inHours(24),
      endAt: inHours(28),
      timezone: 'America/New_York',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'DRAFT', taskCount: 0 });
    eventId = res.body.data.id;

    expect((await api('ana').post('/events', { title: 'Nope', startAt: inHours(1), endAt: inHours(2), timezone: 'UTC' })).status).toBe(403);
    expect((await api('ana').get(`/events/${eventId}`)).status).toBe(404);
    expect((await api('ana').get('/events')).body.data).toHaveLength(0);
    expect((await api('outsider').get('/events')).status).toBe(404);
  });

  it('enforces the event state machine and publishes', async () => {
    const skip = await api('manager').post(`/events/${eventId}/transition`, { status: 'COMPLETED' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_STATE_TRANSITION');
    const pub = await api('manager').post(`/events/${eventId}/transition`, { status: 'PUBLISHED' });
    expect(pub.status).toBe(200);
    expect(pub.body.data.publishedAt).toBeTruthy();
    expect((await api('ana').get(`/events/${eventId}`)).status).toBe(200);
  });

  it('rejects an edit that would end before it starts', async () => {
    const res = await api('manager').patch(`/events/${eventId}`, { endAt: inHours(1) });
    expect(res.status).toBe(400);
  });

  it('filters events by time window', async () => {
    expect((await api('manager').get(`/events?from=${encodeURIComponent(inHours(30))}`)).body.data).toHaveLength(0);
    expect((await api('manager').get(`/events?from=${encodeURIComponent(inHours(25))}`)).body.data).toHaveLength(1);
  });

  it('cancelling an event cancels its open tasks and assignments', async () => {
    const t = await api('manager').post('/tasks', { title: 'Set tables', eventId });
    expect(t.status).toBe(201);
    await api('manager').post(`/tasks/${t.body.data.id}/transition`, { status: 'SCHEDULED' });
    const a = await api('manager').post(`/tasks/${t.body.data.id}/assignments`, { userId: users.ana!.id });
    expect(a.status).toBe(201);

    const cancel = await api('manager').post(`/events/${eventId}/transition`, { status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    const task = await api('manager').get(`/tasks/${t.body.data.id}`);
    expect(task.body.data.status).toBe('CANCELLED');
    expect(task.body.data.assignments[0].status).toBe('CANCELLED');
    expect((await api('manager').patch(`/events/${eventId}`, { title: 'Again' })).status).toBe(409);
  });
});

describe('tasks', () => {
  it('requires the event to be published before scheduling its tasks', async () => {
    const ev = await api('manager').post('/events', { title: 'Draft ev', startAt: inHours(5), endAt: inHours(6), timezone: 'UTC' });
    const t = await api('manager').post('/tasks', { title: 'Prep', eventId: ev.body.data.id });
    const s = await api('manager').post(`/tasks/${t.body.data.id}/transition`, { status: 'SCHEDULED' });
    expect(s.status).toBe(409);
  });

  it('validates headcount, location, and owner', async () => {
    expect((await api('manager').post('/tasks', { title: 'X', requiredHeadcount: 2, minimumRequiredHeadcount: 3 })).status).toBe(400);
    expect((await api('manager').post('/tasks', { title: 'X', locationId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await api('manager').post('/tasks', { title: 'X', ownerUserId: users.outsider!.id })).status).toBe(400);
    expect((await api('ana').post('/tasks', { title: 'X' })).status).toBe(403);
  });

  it('does not allow staffing states to be set by hand', async () => {
    const t = await newScheduledTask();
    const res = await api('manager').post(`/tasks/${t.id}/transition`, { status: 'FULLY_STAFFED' });
    expect(res.status).toBe(400);
  });

  it('rejects stale writes with expectedVersion', async () => {
    const t = await newScheduledTask();
    const ok = await api('manager').patch(`/tasks/${t.id}`, { title: 'Reset chairs (hall B)', expectedVersion: t.version });
    expect(ok.status).toBe(200);
    expect(ok.body.data.version).toBe(t.version + 1);
    const stale = await api('manager').patch(`/tasks/${t.id}`, { title: 'Lost update', expectedVersion: t.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.currentVersion).toBe(t.version + 1);
  });

  it('hides draft tasks from staff', async () => {
    const t = await api('manager').post('/tasks', { title: 'Secret draft' });
    expect((await api('ana').get(`/tasks/${t.body.data.id}`)).status).toBe(404);
    const list = await api('ana').get('/tasks');
    expect(list.body.data.some((x: { id: string }) => x.id === t.body.data.id)).toBe(false);
  });
});

describe('assignments and staffing', () => {
  it('runs the full lifecycle and derives staffing states', async () => {
    const t = await newScheduledTask({ requiredHeadcount: 2 });

    const draft = await api('manager').post('/tasks', { title: 'Draft only' });
    expect((await api('manager').post(`/tasks/${draft.body.data.id}/assignments`, { userId: users.ana!.id })).status).toBe(409);

    const a1 = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ana!.id });
    const a2 = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ben!.id });
    expect(a1.status).toBe(201);
    expect(a1.body.data).toMatchObject({ status: 'ASSIGNED', assignmentSource: 'MANAGER' });

    // Duplicate live assignment for the same person is rejected by the unique index.
    expect((await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ana!.id, overrideReason: 'dup test' })).status).toBe(409);

    // Only the assignee can accept.
    expect((await api('ben').post(`/assignments/${a1.body.data.id}/accept`)).status).toBe(404);
    expect((await api('manager').post(`/assignments/${a1.body.data.id}/accept`)).status).toBe(403);

    expect((await api('ana').post(`/assignments/${a1.body.data.id}/accept`)).status).toBe(200);
    expect((await api('manager').get(`/tasks/${t.id}`)).body.data.status).toBe('PARTIALLY_STAFFED');

    expect((await api('ben').post(`/assignments/${a2.body.data.id}/accept`)).status).toBe(200);
    const full = await api('manager').get(`/tasks/${t.id}`);
    expect(full.body.data.status).toBe('FULLY_STAFFED');
    expect(full.body.data.staffing).toEqual({ assigned: 2, staffed: 2 });

    // Schedule shows the assignment to the assignee only.
    const sched = await api('ana').get('/schedule');
    expect(sched.status).toBe(200);
    expect(sched.body.data.some((s: { task: { id: string } }) => s.task.id === t.id)).toBe(true);
    expect((await api('cy').get('/schedule')).body.data.some((s: { task: { id: string } }) => s.task.id === t.id)).toBe(false);

    // Starting work moves the task to IN_PROGRESS.
    expect((await api('ana').post(`/assignments/${a1.body.data.id}/complete`)).status).toBe(409);
    expect((await api('ana').post(`/assignments/${a1.body.data.id}/start`)).status).toBe(200);
    expect((await api('manager').get(`/tasks/${t.id}`)).body.data.status).toBe('IN_PROGRESS');
    expect((await api('ana').post(`/assignments/${a1.body.data.id}/complete`)).status).toBe(200);

    const done = await api('manager').post(`/tasks/${t.id}/transition`, { status: 'COMPLETED' });
    expect(done.status).toBe(200);
    expect(done.body.data.completedAt).toBeTruthy();
    expect((await api('manager').patch(`/tasks/${t.id}`, { title: 'Too late' })).status).toBe(409);
  });

  it('requires an audited override reason past the required headcount', async () => {
    const t = await newScheduledTask({ requiredHeadcount: 1 });
    expect((await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ana!.id })).status).toBe(201);
    const blocked = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ben!.id });
    expect(blocked.status).toBe(409);
    const ok = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ben!.id, overrideReason: 'VIP area needs a second person' });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ assignmentSource: 'MANAGER_OVERRIDE', overrideReason: 'VIP area needs a second person' });

    const { rows } = await ctx.pg.query<{ action: string }>(
      `select action from audit_logs where entity_id = $1::uuid`,
      [ok.body.data.id],
    );
    expect(rows.map((r) => r.action)).toContain('task.assigned_override');
  });

  it('rejects assigning non-members', async () => {
    const t = await newScheduledTask();
    expect((await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.outsider!.id })).status).toBe(400);
  });

  it('lets staff decline, and managers cancel, returning the task to scheduled', async () => {
    const t = await newScheduledTask({ requiredHeadcount: 1 });
    const a = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.cy!.id });
    expect((await api('cy').post(`/assignments/${a.body.data.id}/decline`)).status).toBe(200);
    expect((await api('manager').get(`/tasks/${t.id}`)).body.data.staffing.assigned).toBe(0);

    const b = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.cy!.id });
    expect(b.status).toBe(201);
    await api('cy').post(`/assignments/${b.body.data.id}/accept`);
    expect((await api('manager').get(`/tasks/${t.id}`)).body.data.status).toBe('FULLY_STAFFED');
    expect((await api('cy').post(`/assignments/${b.body.data.id}/cancel`)).status).toBe(404);
    expect((await api('manager').post(`/assignments/${b.body.data.id}/cancel`)).status).toBe(200);
    expect((await api('manager').get(`/tasks/${t.id}`)).body.data.status).toBe('SCHEDULED');
  });

  it('cancelling a task cancels its live assignments', async () => {
    const t = await newScheduledTask();
    const a = await api('manager').post(`/tasks/${t.id}/assignments`, { userId: users.ana!.id });
    expect((await api('manager').post(`/tasks/${t.id}/transition`, { status: 'CANCELLED' })).status).toBe(200);
    const task = await api('manager').get(`/tasks/${t.id}`);
    expect(task.body.data.assignments.find((x: { id: string }) => x.id === a.body.data.id).status).toBe('CANCELLED');
    expect((await api('ana').post(`/assignments/${a.body.data.id}/accept`)).status).toBe(409);
  });
});
