import { randomBytes } from 'node:crypto';
import type { CreateOrganizationInput, OrganizationWithRole } from '@teampilot/shared';
import type { Db } from '../db/types';
import { writeAudit } from '../repositories/audit';
import { insertMembership } from '../repositories/memberships';
import { insertOrganization, slugExists } from '../repositories/organizations';
import { ensureProfile } from '../repositories/profiles';
import { conflict } from '../utils/errors';

export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `org-${base || 'team'}`.slice(0, 48);
}

export async function createOrganization(
  db: Db,
  userId: string,
  input: CreateOrganizationInput,
): Promise<OrganizationWithRole> {
  return db.transaction(async (tx) => {
    await ensureProfile(tx, userId);
    let slug = input.slug ?? slugify(input.name);
    if (await slugExists(tx, slug)) {
      if (input.slug) throw conflict('That organization slug is already taken');
      slug = `${slug}-${randomBytes(3).toString('hex')}`;
    }
    const org = await insertOrganization(tx, { name: input.name, slug, timezone: input.timezone });
    await insertMembership(tx, org.id, userId, 'OWNER');
    await tx.query('insert into subscriptions (organization_id) values ($1)', [org.id]);
    await writeAudit(tx, {
      organizationId: org.id,
      actorUserId: userId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
    });
    return { ...org, role: 'OWNER' };
  });
}
