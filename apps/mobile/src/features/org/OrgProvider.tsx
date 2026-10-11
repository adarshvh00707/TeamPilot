import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { hasRoleAtLeast, type Me, type Role } from '@teampilot/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMe } from './api';

const ACTIVE_ORG_KEY = 'teampilot.activeOrganizationId';

type Membership = Me['memberships'][number];

interface OrgState {
  me: Me | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  memberships: Membership[];
  active: Membership | null;
  setActiveOrganization: (organizationId: string) => Promise<void>;
  /** UI hints only. The API re-checks every permission. */
  role: Role | null;
  isManager: boolean;
  isAdmin: boolean;
}

const OrgContext = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const meQuery = useMe(!!session);
  const [storedId, setStoredId] = useState<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(ACTIVE_ORG_KEY).then(setStoredId).catch(() => setStoredId(null));
  }, []);

  const setActiveOrganization = useCallback(async (organizationId: string) => {
    setStoredId(organizationId);
    await SecureStore.setItemAsync(ACTIVE_ORG_KEY, organizationId);
  }, []);

  const value = useMemo<OrgState>(() => {
    const memberships = meQuery.data?.memberships ?? [];
    const active = memberships.find((m) => m.organizationId === storedId) ?? memberships[0] ?? null;
    const role = active?.role ?? null;
    return {
      me: meQuery.data,
      loading: meQuery.isPending && !!session,
      error: meQuery.error,
      refetch: () => void meQuery.refetch(),
      memberships,
      active,
      setActiveOrganization,
      role,
      isManager: role ? hasRoleAtLeast(role, 'MANAGER') : false,
      isAdmin: role ? hasRoleAtLeast(role, 'ADMIN') : false,
    };
  }, [meQuery.data, meQuery.isPending, meQuery.error, meQuery.refetch, storedId, session, setActiveOrganization]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}

/** For screens that are only reachable once an organization is active. */
export function useActiveOrgId(): string {
  const { active } = useOrg();
  if (!active) throw new Error('No active organization');
  return active.organizationId;
}
