import { Router } from 'express';
import { registerDeviceSchema, uuidSchema } from '@teampilot/shared';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { requireOrgRole } from '../middleware/org-access';
import { countUnread, listInApp, markRead, revokeDevice, upsertDevice } from '../repositories/notifications';
import { notFound } from '../utils/errors';

const revokeSchema = z.strictObject({ pushToken: z.string().min(1).max(300) });

export function notificationsRouter({ db }: AppDeps): Router {
  const r = Router();
  const member = requireOrgRole(db, 'STAFF');
  const ORG = '/organizations/:organizationId';

  // Devices belong to the user, not an org; the optional org id records where they registered.
  r.post('/me/devices', async (req, res) => {
    const input = registerDeviceSchema.parse(req.body);
    const orgId = uuidSchema.safeParse(req.query.organizationId);
    await upsertDevice(db, req.auth!.userId, orgId.success ? orgId.data : null, input);
    res.status(204).end();
  });
  r.post('/me/devices/revoke', async (req, res) => {
    const { pushToken } = revokeSchema.parse(req.body);
    await revokeDevice(db, req.auth!.userId, pushToken);
    res.status(204).end();
  });

  r.get(`${ORG}/notifications`, member, async (req, res) => {
    const [items, unread] = await Promise.all([
      listInApp(db, req.org!.organizationId, req.auth!.userId),
      countUnread(db, req.org!.organizationId, req.auth!.userId),
    ]);
    res.json({ data: items, meta: { unread } });
  });
  r.post(`${ORG}/notifications/read-all`, member, async (req, res) => {
    res.json({ data: { updated: await markRead(db, req.org!.organizationId, req.auth!.userId) } });
  });
  r.post(`${ORG}/notifications/:notificationId/read`, member, async (req, res) => {
    const id = uuidSchema.safeParse(req.params.notificationId);
    if (!id.success || !(await markRead(db, req.org!.organizationId, req.auth!.userId, id.data))) {
      throw notFound('Notification not found or already read');
    }
    res.json({ data: { updated: 1 } });
  });

  return r;
}
