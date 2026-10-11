import { Router, type Request } from 'express';
import { declineOfferSchema, pauseOffersSchema, startBreakSchema, uuidSchema } from '@teampilot/shared';
import type { AppDeps } from '../app';
import { requireOrgRole } from '../middleware/org-access';
import { loadMemberSignals } from '../repositories/attendance';
import { listOpenOffersForUser } from '../repositories/dispatch';
import { changeMyAvailability, getMyAvailability } from '../services/availability';
import { acceptOffer, declineOffer, startDispatch, stopDispatch } from '../services/dispatch';
import type { Actor } from '../services/work';
import { notFound } from '../utils/errors';

const idParam = (value: unknown, label: string) => {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw notFound(`${label} not found`);
  return parsed.data;
};

const actorOf = (req: Request): Actor => ({
  organizationId: req.org!.organizationId,
  actorUserId: req.auth!.userId,
  actorRole: req.org!.role,
});

export function dispatchRouter({ db }: AppDeps): Router {
  const r = Router();
  const member = requireOrgRole(db, 'STAFF');
  const manager = requireOrgRole(db, 'MANAGER');
  const ORG = '/organizations/:organizationId';

  // Own availability
  r.get(`${ORG}/me/availability`, member, async (req, res) => {
    res.json({ data: await getMyAvailability(db, req.org!.organizationId, req.auth!.userId) });
  });
  r.post(`${ORG}/me/clock-in`, member, async (req, res) => {
    res.json({ data: await changeMyAvailability(db, actorOf(req), 'clock_in') });
  });
  r.post(`${ORG}/me/clock-out`, member, async (req, res) => {
    res.json({ data: await changeMyAvailability(db, actorOf(req), 'clock_out') });
  });
  r.post(`${ORG}/me/pause`, member, async (req, res) => {
    const { reason } = pauseOffersSchema.parse(req.body);
    res.json({ data: await changeMyAvailability(db, actorOf(req), 'pause', { reason }) });
  });
  r.post(`${ORG}/me/resume`, member, async (req, res) => {
    res.json({ data: await changeMyAvailability(db, actorOf(req), 'resume') });
  });
  r.post(`${ORG}/me/breaks/start`, member, async (req, res) => {
    const { minutes } = startBreakSchema.parse(req.body);
    res.json({ data: await changeMyAvailability(db, actorOf(req), 'break_start', { minutes }) });
  });
  r.post(`${ORG}/me/breaks/end`, member, async (req, res) => {
    res.json({ data: await changeMyAvailability(db, actorOf(req), 'break_end') });
  });

  // Live roster for managers
  r.get(`${ORG}/roster`, manager, async (req, res) => {
    const rows = await loadMemberSignals(db, req.org!.organizationId);
    res.json({
      data: rows.map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role, activeAssignments: m.activeAssignments, ...m.availability })),
    });
  });

  // Offers
  r.get(`${ORG}/me/offers`, member, async (req, res) => {
    res.json({ data: await listOpenOffersForUser(db, req.org!.organizationId, req.auth!.userId) });
  });
  r.post(`${ORG}/offers/:offerId/accept`, member, async (req, res) => {
    res.json({ data: await acceptOffer(db, actorOf(req), idParam(req.params.offerId, 'Offer')) });
  });
  r.post(`${ORG}/offers/:offerId/decline`, member, async (req, res) => {
    const input = declineOfferSchema.parse(req.body);
    res.json({ data: await declineOffer(db, actorOf(req), idParam(req.params.offerId, 'Offer'), input) });
  });

  // Dispatch control
  r.post(`${ORG}/tasks/:taskId/dispatch`, manager, async (req, res) => {
    res.json({ data: await startDispatch(db, actorOf(req), idParam(req.params.taskId, 'Task')) });
  });
  r.post(`${ORG}/tasks/:taskId/dispatch/stop`, manager, async (req, res) => {
    res.json({ data: await stopDispatch(db, actorOf(req), idParam(req.params.taskId, 'Task')) });
  });

  return r;
}
