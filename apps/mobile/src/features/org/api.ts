import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatedInvitation,
  CreateInvitationInput,
  CreateLocationInput,
  CreateOrganizationInput,
  Invitation,
  Location,
  Me,
  Member,
  OrganizationWithRole,
  Profile,
  UpdateMembershipInput,
  UpdateProfileInput,
} from '@teampilot/shared';
import { api } from '@/lib/api';

export const queryKeys = {
  me: ['me'] as const,
  organizations: ['organizations'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  invitations: (orgId: string) => ['org', orgId, 'invitations'] as const,
  locations: (orgId: string) => ['org', orgId, 'locations'] as const,
};

export function useMe(enabled = true) {
  return useQuery({ queryKey: queryKeys.me, queryFn: async () => (await api.get<Me>('/me')).data, enabled });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => (await api.patch<Profile>('/me', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: async () => (await api.get<OrganizationWithRole[]>('/organizations')).data,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) =>
      (await api.post<OrganizationWithRole>('/organizations', input)).data,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.me }),
        qc.invalidateQueries({ queryKey: queryKeys.organizations }),
      ]);
    },
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) =>
      (await api.post<{ organizationId: string; role: string }>('/invitations/accept', { token })).data,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.me }),
        qc.invalidateQueries({ queryKey: queryKeys.organizations }),
      ]);
    },
  });
}

export function useMembers(orgId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.members(orgId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '25', ...(pageParam ? { cursor: pageParam } : {}) });
      return api.get<Member[]>(`/organizations/${orgId}/members?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export function useUpdateMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...input }: UpdateMembershipInput & { userId: string }) =>
      (await api.patch<Member>(`/organizations/${orgId}/members/${userId}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members(orgId) }),
  });
}

export function useInvitations(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invitations(orgId),
    queryFn: async () => (await api.get<Invitation[]>(`/organizations/${orgId}/invitations`)).data,
    enabled,
  });
}

export function useCreateInvitation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvitationInput) =>
      (await api.post<CreatedInvitation>(`/organizations/${orgId}/invitations`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(orgId) }),
  });
}

export function useRevokeInvitation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) =>
      (await api.post<Invitation>(`/organizations/${orgId}/invitations/${invitationId}/revoke`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(orgId) }),
  });
}

export function useLocations(orgId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.locations(orgId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '50', ...(pageParam ? { cursor: pageParam } : {}) });
      return api.get<Location[]>(`/organizations/${orgId}/locations?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export function useCreateLocation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLocationInput) =>
      (await api.post<Location>(`/organizations/${orgId}/locations`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.locations(orgId) }),
  });
}

export function useArchiveLocation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locationId: string) =>
      (await api.patch<Location>(`/organizations/${orgId}/locations/${locationId}`, { archived: true })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.locations(orgId) }),
  });
}
