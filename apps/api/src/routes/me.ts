import { Router } from 'express';
import { acceptInvitationSchema, updateProfileSchema, type Me } from '@teampilot/shared';
import type { AppDeps } from '../app';
import { ensureProfile, listMembershipSummaries, updateProfile } from '../repositories/profiles';
import { acceptInvitation } from '../services/invitations';

export function meRouter({ db }: AppDeps): Router {
  const r = Router();

  r.get('/me', async (req, res) => {
    const { userId, email } = req.auth!;
    const profile = await ensureProfile(db, userId);
    const memberships = await listMembershipSummaries(db, userId);
    const body: Me = { profile, email, memberships };
    res.json({ data: body });
  });

  r.patch('/me', async (req, res) => {
    const input = updateProfileSchema.parse(req.body);
    await ensureProfile(db, req.auth!.userId);
    res.json({ data: await updateProfile(db, req.auth!.userId, input) });
  });

  r.post('/invitations/accept', async (req, res) => {
    const { token } = acceptInvitationSchema.parse(req.body);
    res.json({ data: await acceptInvitation(db, req.auth!, token) });
  });

  return r;
}
