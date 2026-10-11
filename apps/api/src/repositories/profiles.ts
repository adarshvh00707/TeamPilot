import type { MembershipStatus, Profile, Role } from '@teampilot/shared';
import type { Queryable } from '../db/types';

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  notification_preferences: Record<string, boolean>;
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  notificationPreferences: r.notification_preferences ?? {},
});

/** Profiles are normally created by the auth.users trigger; this is a safety net for older accounts. */
export async function ensureProfile(db: Queryable, userId: string): Promise<Profile> {
  const { rows } = await db.query<ProfileRow>(
    `insert into profiles (id) values ($1)
     on conflict (id) do update set id = excluded.id
     returning id, display_name, avatar_url, notification_preferences`,
    [userId],
  );
  return toProfile(rows[0]!);
}

export async function updateProfile(
  db: Queryable,
  userId: string,
  patch: { displayName?: string; avatarUrl?: string | null; notificationPreferences?: Record<string, boolean> },
): Promise<Profile> {
  const { rows } = await db.query<ProfileRow>(
    `update profiles set
       display_name = coalesce($2, display_name),
       avatar_url = case when $3::boolean then $4 else avatar_url end,
       notification_preferences = case when $5::jsonb is null then notification_preferences
                                       else notification_preferences || $5::jsonb end
     where id = $1
     returning id, display_name, avatar_url, notification_preferences`,
    [
      userId,
      patch.displayName ?? null,
      patch.avatarUrl !== undefined,
      patch.avatarUrl ?? null,
      patch.notificationPreferences ? JSON.stringify(patch.notificationPreferences) : null,
    ],
  );
  return toProfile(rows[0]!);
}

export async function listMembershipSummaries(db: Queryable, userId: string) {
  const { rows } = await db.query<{ organization_id: string; name: string; role: Role; status: MembershipStatus }>(
    `select m.organization_id, o.name, m.role, m.status
     from memberships m join organizations o on o.id = m.organization_id
     where m.user_id = $1 and m.status = 'ACTIVE' order by o.name`,
    [userId],
  );
  return rows.map((r) => ({ organizationId: r.organization_id, organizationName: r.name, role: r.role, status: r.status }));
}
