import type { MembershipStatus, Role } from '../constants/domain';

export interface ApiSuccess<T> {
  data: T;
  meta?: { nextCursor?: string | null };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationWithRole extends Organization {
  role: Role;
}

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  notificationPreferences: Record<string, boolean>;
}

export interface Me {
  profile: Profile;
  email: string | null;
  memberships: Array<{ organizationId: string; organizationName: string; role: Role; status: MembershipStatus }>;
}

export interface Member {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  status: MembershipStatus;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedInvitation extends Invitation {
  /** Returned exactly once at creation; only its hash is stored. */
  token: string;
}

export interface Location {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
}
