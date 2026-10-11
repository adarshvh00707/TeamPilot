import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestDb();
  const { pg } = t;
  ids.ownerA = await t.createUser('owner-a@example.com', 'Owner A');
  ids.managerA = await t.createUser('manager-a@example.com');
  ids.staffA1 = await t.createUser('staff-a1@example.com');
  ids.staffA2 = await t.createUser('staff-a2@example.com');
  ids.ownerB = await t.createUser('owner-b@example.com');

  const orgA = await pg.query<{ id: string }>(`insert into organizations (name, slug) values ('Org A', 'org-a') returning id`);
  const orgB = await pg.query<{ id: string }>(`insert into organizations (name, slug) values ('Org B', 'org-b') returning id`);
  ids.orgA = orgA.rows[0]!.id;
  ids.orgB = orgB.rows[0]!.id;

  await pg.query(
    `insert into memberships (organization_id, user_id, role) values
      ($1, $2, 'OWNER'), ($1, $3, 'MANAGER'), ($1, $4, 'STAFF'), ($1, $5, 'STAFF'), ($6, $7, 'OWNER')`,
    [ids.orgA, ids.ownerA, ids.managerA, ids.staffA1, ids.staffA2, ids.orgB, ids.ownerB],
  );

  const task = await pg.query<{ id: string }>(
    `insert into tasks (organization_id, title, status) values ($1, 'Prepare the Atrium', 'DISPATCHING') returning id`,
    [ids.orgA],
  );
  ids.taskA = task.rows[0]!.id;
  const draft = await pg.query<{ id: string }>(
    `insert into tasks (organization_id, title) values ($1, 'Draft task') returning id`,
    [ids.orgA],
  );
  ids.draftA = draft.rows[0]!.id;
  await pg.query(
    `insert into task_assignments (organization_id, task_id, user_id, status, assignment_source) values
      ($1, $2, $3, 'ACCEPTED', 'OFFER'), ($1, $2, $4, 'ACCEPTED', 'OFFER')`,
    [ids.orgA, ids.taskA, ids.staffA1, ids.staffA2],
  );
  await pg.query(
    `insert into invitations (organization_id, email, role, token_hash, expires_at)
     values ($1, 'new@example.com', 'STAFF', 'secret-hash', now() + interval '1 day')`,
    [ids.orgA],
  );
  await pg.query(
    `insert into documents (organization_id, storage_path, filename, content_type, size_bytes)
     values ($1::uuid, $1::text || '/doc/schedule.pdf', 'schedule.pdf', 'application/pdf', 100)`,
    [ids.orgA],
  );
});

afterAll(async () => {
  await t.pg.close();
});

describe('organization isolation', () => {
  it('users only see organizations they belong to', async () => {
    const rows = await asUser(t.pg, ids.ownerA!, (tx) => tx.query<{ id: string }>('select id from organizations'));
    expect(rows.rows.map((r) => r.id)).toEqual([ids.orgA]);
  });

  it('members of another org cannot see tasks, memberships, or assignments', async () => {
    await asUser(t.pg, ids.ownerB!, async (tx) => {
      expect((await tx.query('select id from tasks where organization_id = $1', [ids.orgA])).rows).toHaveLength(0);
      expect((await tx.query('select 1 from memberships where organization_id = $1', [ids.orgA])).rows).toHaveLength(0);
      expect((await tx.query('select 1 from task_assignments')).rows).toHaveLength(0);
    });
  });

  it('anonymous clients see nothing', async () => {
    await expect(asUser(t.pg, null, (tx) => tx.query('select * from organizations'))).rejects.toThrow(/permission denied/);
  });
});

describe('staff visibility', () => {
  it('staff see only their own assignments; managers see all', async () => {
    const staff = await asUser(t.pg, ids.staffA1!, (tx) => tx.query<{ user_id: string }>('select user_id from task_assignments'));
    expect(staff.rows.map((r) => r.user_id)).toEqual([ids.staffA1]);
    const mgr = await asUser(t.pg, ids.managerA!, (tx) => tx.query('select user_id from task_assignments'));
    expect(mgr.rows).toHaveLength(2);
  });

  it('staff cannot see draft tasks; managers can', async () => {
    const staff = await asUser(t.pg, ids.staffA1!, (tx) => tx.query<{ id: string }>('select id from tasks'));
    expect(staff.rows.map((r) => r.id)).toEqual([ids.taskA]);
    const mgr = await asUser(t.pg, ids.managerA!, (tx) => tx.query('select id from tasks'));
    expect(mgr.rows).toHaveLength(2);
  });

  it('private documents are visible to managers only', async () => {
    expect((await asUser(t.pg, ids.staffA1!, (tx) => tx.query('select id from documents'))).rows).toHaveLength(0);
    expect((await asUser(t.pg, ids.managerA!, (tx) => tx.query('select id from documents'))).rows).toHaveLength(1);
  });
});

describe('write protection', () => {
  it('users cannot change their own role', async () => {
    await expect(
      asUser(t.pg, ids.staffA1!, (tx) =>
        tx.query(`update memberships set role = 'OWNER' where user_id = $1`, [ids.staffA1]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('users can update their own profile name but not another user profile', async () => {
    await asUser(t.pg, ids.staffA1!, async (tx) => {
      const own = await tx.query(`update profiles set display_name = 'Me' where id = $1`, [ids.staffA1]);
      expect(own.affectedRows).toBe(1);
      const other = await tx.query(`update profiles set display_name = 'Hacked' where id = $1`, [ids.staffA2]);
      expect(other.affectedRows).toBe(0);
    });
  });

  it('users cannot register a push token for another user', async () => {
    await expect(
      asUser(t.pg, ids.staffA1!, (tx) =>
        tx.query(`insert into notification_devices (user_id, platform, push_token) values ($1, 'ios', 'tok-other')`, [ids.staffA2]),
      ),
    ).rejects.toThrow(/row-level security/);
    const ok = await asUser(t.pg, ids.staffA1!, (tx) =>
      tx.query(`insert into notification_devices (user_id, platform, push_token) values ($1, 'ios', 'tok-own')`, [ids.staffA1]),
    );
    expect(ok.affectedRows).toBe(1);
  });

  it('employees cannot forge attendance or break status', async () => {
    await expect(
      asUser(t.pg, ids.staffA1!, (tx) =>
        tx.query(`insert into attendance_records (organization_id, user_id, source, verification_status, clock_in_at)
                  values ($1, $2, 'SLING', 'VERIFIED', now())`, [ids.orgA, ids.staffA1]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(t.pg, ids.staffA1!, (tx) =>
        tx.query(`insert into break_records (organization_id, user_id, expected_end_at, source)
                  values ($1, $2, now() + interval '20 minutes', 'EMPLOYEE')`, [ids.orgA, ids.staffA1]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('employees cannot accept offers or create assignments directly', async () => {
    await expect(
      asUser(t.pg, ids.ownerB!, (tx) =>
        tx.query(`insert into task_assignments (organization_id, task_id, user_id, status, assignment_source)
                  values ($1, $2, $3, 'ACCEPTED', 'OFFER')`, [ids.orgA, ids.taskA, ids.ownerB]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('invitation token hashes are never readable by clients', async () => {
    await expect(
      asUser(t.pg, ids.ownerA!, (tx) => tx.query('select token_hash from invitations')),
    ).rejects.toThrow(/permission denied/);
    const ok = await asUser(t.pg, ids.ownerA!, (tx) => tx.query('select email from invitations'));
    expect(ok.rows).toHaveLength(1);
    const staff = await asUser(t.pg, ids.staffA1!, (tx) => tx.query('select email from invitations'));
    expect(staff.rows).toHaveLength(0);
  });
});

describe('database constraints', () => {
  it('prevents two live assignments for the same user and task', async () => {
    await expect(
      t.pg.query(
        `insert into task_assignments (organization_id, task_id, user_id, status, assignment_source)
         values ($1, $2, $3, 'ASSIGNED', 'MANAGER')`,
        [ids.orgA, ids.taskA, ids.staffA1],
      ),
    ).rejects.toThrow(/task_assignments_one_live_per_user/);
  });

  it('prevents two active offers for the same user and task', async () => {
    const insert = (key: string) =>
      t.pg.query(
        `insert into task_offers (organization_id, task_id, user_id, expires_at, idempotency_key)
         values ($1, $2, $3, now() + interval '10 minutes', $4)`,
        [ids.orgA, ids.draftA, ids.staffA1, key],
      );
    await insert('k1');
    await expect(insert('k2')).rejects.toThrow(/task_offers_one_active_per_user/);
  });

  it('prevents overlapping active breaks', async () => {
    const insert = () =>
      t.pg.query(
        `insert into break_records (organization_id, user_id, expected_end_at, source)
         values ($1, $2, now() + interval '20 minutes', 'EMPLOYEE')`,
        [ids.orgA, ids.staffA2],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/break_records_one_active/);
  });

  it('requires a reason for manager overrides', async () => {
    await expect(
      t.pg.query(
        `insert into task_assignments (organization_id, task_id, user_id, assignment_source)
         values ($1, $2, $3, 'MANAGER_OVERRIDE')`,
        [ids.orgA, ids.draftA, ids.managerA],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('creates a profile automatically for new auth users', async () => {
    const id = await t.createUser('fresh@example.com', 'Fresh User');
    const { rows } = await t.pg.query<{ display_name: string }>('select display_name from profiles where id = $1', [id]);
    expect(rows[0]?.display_name).toBe('Fresh User');
  });
});
