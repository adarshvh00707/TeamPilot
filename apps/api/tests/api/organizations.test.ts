import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, tokenFor } from '../helpers/test-app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
let ctx: Ctx;
const users: Record<string, { id: string; email: string; token: string }> = {};
let orgId: string;

async function makeUser(key: string, email: string) {
  const id = await ctx.createUser(email);
  users[key] = { id, email, token: await tokenFor(id, email) };
}

const api = (key: string) => {
  const auth = { Authorization: `Bearer ${users[key]!.token}` };
  return {
    get: (url: string) => request(ctx.app).get(url).set(auth),
    post: (url: string, body?: object) => request(ctx.app).post(url).set(auth).send(body ?? {}),
    patch: (url: string, body: object) => request(ctx.app).patch(url).set(auth).send(body),
  };
};

async function inviteAndAccept(inviter: string, invitee: string, role: string) {
  const inv = await api(inviter).post(`/api/v1/organizations/${orgId}/invitations`, { email: users[invitee]!.email, role });
  expect(inv.status).toBe(201);
  const accepted = await api(invitee).post('/api/v1/invitations/accept', { token: inv.body.data.token });
  expect(accepted.status).toBe(200);
}

beforeAll(async () => {
  ctx = await createTestApp();
  await makeUser('owner', 'owner@example.com');
  await makeUser('admin', 'admin@example.com');
  await makeUser('manager', 'manager@example.com');
  await makeUser('staff', 'staff@example.com');
  await makeUser('outsider', 'outsider@example.com');
});

afterAll(async () => {
  await ctx.pg.close();
});

describe('system endpoints', () => {
  it('reports health and readiness', async () => {
    expect((await request(ctx.app).get('/health')).body).toEqual({ status: 'ok' });
    const ready = await request(ctx.app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks.database).toBe('ok');
  });

  it('serves an OpenAPI document', async () => {
    const res = await request(ctx.app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/api/v1/organizations'].post.requestBody).toBeDefined();
  });

  it('echoes a request id', async () => {
    const res = await request(ctx.app).get('/health').set('x-request-id', 'abc12345-test');
    expect(res.headers['x-request-id']).toBe('abc12345-test');
  });
});

describe('authentication', () => {
  it('rejects missing and invalid tokens', async () => {
    expect((await request(ctx.app).get('/api/v1/me')).status).toBe(401);
    const bad = await request(ctx.app).get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt');
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects anon-role tokens', async () => {
    const t = await tokenFor(users.owner!.id, users.owner!.email, { role: 'anon' });
    expect((await request(ctx.app).get('/api/v1/me').set('Authorization', `Bearer ${t}`)).status).toBe(401);
  });
});

describe('organizations and roles', () => {
  it('creates an organization with the creator as OWNER', async () => {
    const res = await api('owner').post('/api/v1/organizations', { name: 'Demo Venue', timezone: 'America/New_York' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Demo Venue', slug: 'demo-venue', role: 'OWNER', timezone: 'America/New_York' });
    orgId = res.body.data.id;

    const again = await api('owner').post('/api/v1/organizations', { name: 'Demo Venue', timezone: 'UTC' });
    expect(again.status).toBe(201);
    expect(again.body.data.slug).toMatch(/^demo-venue-[0-9a-f]{6}$/);
  });

  it('rejects invalid timezones', async () => {
    const res = await api('owner').post('/api/v1/organizations', { name: 'X Org', timezone: 'Moon/Base' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('hides organizations from non-members', async () => {
    const res = await api('outsider').get(`/api/v1/organizations/${orgId}`);
    expect(res.status).toBe(404);
    expect((await api('outsider').get(`/api/v1/organizations/${orgId}/members`)).status).toBe(404);
  });

  it('runs the invitation flow and enforces the invited email', async () => {
    const inv = await api('owner').post(`/api/v1/organizations/${orgId}/invitations`, { email: 'STAFF@example.com', role: 'STAFF' });
    expect(inv.status).toBe(201);
    expect(inv.body.data.email).toBe('staff@example.com');
    const token = inv.body.data.token as string;

    const wrongUser = await api('outsider').post('/api/v1/invitations/accept', { token });
    expect(wrongUser.status).toBe(403);

    const ok = await api('staff').post('/api/v1/invitations/accept', { token });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ organizationId: orgId, role: 'STAFF' });

    const reused = await api('staff').post('/api/v1/invitations/accept', { token });
    expect(reused.status).toBe(400);

    const listed = await api('owner').get(`/api/v1/organizations/${orgId}/invitations`);
    expect(JSON.stringify(listed.body)).not.toContain('token_hash');

    await inviteAndAccept('owner', 'admin', 'ADMIN');
    await inviteAndAccept('owner', 'manager', 'MANAGER');
  });

  it('lists members for any member and returns my memberships', async () => {
    const members = await api('staff').get(`/api/v1/organizations/${orgId}/members`);
    expect(members.status).toBe(200);
    expect(members.body.data).toHaveLength(4);
    const me = await api('staff').get('/api/v1/me');
    expect(me.body.data.memberships).toEqual([
      { organizationId: orgId, organizationName: 'Demo Venue', role: 'STAFF', status: 'ACTIVE' },
    ]);
  });

  it('paginates members with a cursor', async () => {
    const first = await api('owner').get(`/api/v1/organizations/${orgId}/members?limit=3`);
    expect(first.body.data).toHaveLength(3);
    expect(first.body.meta.nextCursor).toBeTruthy();
    const second = await api('owner').get(`/api/v1/organizations/${orgId}/members?limit=3&cursor=${first.body.meta.nextCursor}`);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it('prevents staff from inviting or managing members', async () => {
    expect((await api('staff').post(`/api/v1/organizations/${orgId}/invitations`, { email: 'x@example.com', role: 'STAFF' })).status).toBe(403);
    expect((await api('manager').patch(`/api/v1/organizations/${orgId}/members/${users.staff!.id}`, { role: 'MANAGER' })).status).toBe(403);
  });

  it('enforces role hierarchy for admins', async () => {
    const promoteToOwner = await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.staff!.id}`, { role: 'OWNER' });
    expect(promoteToOwner.status).toBe(403);
    const demoteOwner = await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.owner!.id}`, { role: 'STAFF' });
    expect(demoteOwner.status).toBe(403);
    const inviteOwner = await api('admin').post(`/api/v1/organizations/${orgId}/invitations`, { email: 'boss@example.com', role: 'OWNER' });
    expect(inviteOwner.status).toBe(403);
    const promoteStaff = await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.staff!.id}`, { role: 'MANAGER' });
    expect(promoteStaff.status).toBe(200);
    expect(promoteStaff.body.data.role).toBe('MANAGER');
    await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.staff!.id}`, { role: 'STAFF' });
  });

  it('prevents self-modification and losing the last owner', async () => {
    expect((await api('owner').patch(`/api/v1/organizations/${orgId}/members/${users.owner!.id}`, { role: 'STAFF' })).status).toBe(403);
    expect((await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.admin!.id}`, { role: 'OWNER' })).status).toBe(403);

    // Promote admin to owner, then admin (now owner) can demote the original owner; but not the final owner.
    expect((await api('owner').patch(`/api/v1/organizations/${orgId}/members/${users.admin!.id}`, { role: 'OWNER' })).status).toBe(200);
    expect((await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.owner!.id}`, { role: 'ADMIN' })).status).toBe(200);
    const last = await api('owner').patch(`/api/v1/organizations/${orgId}/members/${users.admin!.id}`, { role: 'ADMIN' });
    expect(last.status).toBe(403);
    // Restore.
    expect((await api('admin').patch(`/api/v1/organizations/${orgId}/members/${users.owner!.id}`, { role: 'OWNER' })).status).toBe(200);
    expect((await api('owner').patch(`/api/v1/organizations/${orgId}/members/${users.admin!.id}`, { role: 'ADMIN' })).status).toBe(200);
  });

  it('suspended members lose access', async () => {
    await makeUser('temp', 'temp@example.com');
    await inviteAndAccept('owner', 'temp', 'STAFF');
    expect((await api('temp').get(`/api/v1/organizations/${orgId}`)).status).toBe(200);
    expect((await api('owner').patch(`/api/v1/organizations/${orgId}/members/${users.temp!.id}`, { status: 'SUSPENDED' })).status).toBe(200);
    expect((await api('temp').get(`/api/v1/organizations/${orgId}`)).status).toBe(404);
  });

  it('rejects role changes through the profile endpoint', async () => {
    const res = await api('staff').patch('/api/v1/me', { displayName: 'Sam', role: 'OWNER' });
    expect(res.status).toBe(400);
    const ok = await api('staff').patch('/api/v1/me', { displayName: 'Sam' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.displayName).toBe('Sam');
  });

  it('records audit history', async () => {
    const { rows } = await ctx.pg.query<{ action: string }>(
      'select action from audit_logs where organization_id = $1 order by created_at',
      [orgId],
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('organization.created');
    expect(actions).toContain('invitation.accepted');
    expect(actions).toContain('membership.updated');
  });
});

describe('locations', () => {
  it('lets managers create and staff read locations', async () => {
    expect((await api('staff').post(`/api/v1/organizations/${orgId}/locations`, { name: 'Atrium' })).status).toBe(403);
    const created = await api('manager').post(`/api/v1/organizations/${orgId}/locations`, { name: 'Atrium', description: 'Main space' });
    expect(created.status).toBe(201);
    const dup = await api('manager').post(`/api/v1/organizations/${orgId}/locations`, { name: 'atrium' });
    expect(dup.status).toBe(409);
    await api('manager').post(`/api/v1/organizations/${orgId}/locations`, { name: 'L70' });

    const list = await api('staff').get(`/api/v1/organizations/${orgId}/locations`);
    expect(list.body.data.map((l: { name: string }) => l.name)).toEqual(['Atrium', 'L70']);

    const archived = await api('manager').patch(`/api/v1/organizations/${orgId}/locations/${created.body.data.id}`, { archived: true });
    expect(archived.body.data.archivedAt).toBeTruthy();
    const active = await api('staff').get(`/api/v1/organizations/${orgId}/locations`);
    expect(active.body.data.map((l: { name: string }) => l.name)).toEqual(['L70']);
  });

  it('does not leak locations across organizations', async () => {
    const other = await api('outsider').post('/api/v1/organizations', { name: 'Other Org', timezone: 'UTC' });
    const otherLoc = await api('outsider').post(`/api/v1/organizations/${other.body.data.id}/locations`, { name: 'Secret Room' });
    expect(otherLoc.status).toBe(201);

    const viaMyOrg = await api('owner').get(`/api/v1/organizations/${orgId}/locations/${otherLoc.body.data.id}`);
    expect(viaMyOrg.status).toBe(404);
    const patchViaMyOrg = await api('owner').patch(`/api/v1/organizations/${orgId}/locations/${otherLoc.body.data.id}`, { name: 'Pwned' });
    expect(patchViaMyOrg.status).toBe(404);
  });
});
