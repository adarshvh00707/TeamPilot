import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ManagerDashboard, MyAvailability, MyOffer, RosterEntry } from '@teampilot/shared';
import { api } from '@/lib/api';
import { workKeys } from '@/features/work/api';

export const dispatchKeys = {
  availability: (orgId: string) => ['org', orgId, 'work', 'availability'] as const,
  offers: (orgId: string) => ['org', orgId, 'work', 'offers'] as const,
  roster: (orgId: string) => ['org', orgId, 'work', 'roster'] as const,
};

export function useMyAvailability(orgId: string) {
  return useQuery({
    queryKey: dispatchKeys.availability(orgId),
    queryFn: async () => (await api.get<MyAvailability>(`/organizations/${orgId}/me/availability`)).data,
  });
}

export type AvailabilityAction = 'clock-in' | 'clock-out' | 'pause' | 'resume' | 'breaks/start' | 'breaks/end';

export function useAvailabilityAction(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, body }: { action: AvailabilityAction; body?: object }) =>
      (await api.post<MyAvailability>(`/organizations/${orgId}/me/${action}`, body ?? {})).data,
    onSuccess: (data) => qc.setQueryData(dispatchKeys.availability(orgId), data),
  });
}

/** Offers expire on the server; polling keeps the list honest without push notifications (Phase 4). */
export function useMyOffers(orgId: string) {
  return useQuery({
    queryKey: dispatchKeys.offers(orgId),
    queryFn: async () => (await api.get<MyOffer[]>(`/organizations/${orgId}/me/offers`)).data,
    refetchInterval: 15_000,
  });
}

export function useRespondToOffer(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      (await api.post(`/organizations/${orgId}/offers/${id}/${action}`, {})).data,
    onSettled: () => qc.invalidateQueries({ queryKey: workKeys.all(orgId) }),
  });
}

export function useDashboard(orgId: string) {
  return useQuery({
    queryKey: ['org', orgId, 'work', 'dashboard'],
    queryFn: async () => (await api.get<ManagerDashboard>(`/organizations/${orgId}/dashboard`)).data,
    refetchInterval: 30_000,
  });
}

export function useRoster(orgId: string) {
  return useQuery({
    queryKey: dispatchKeys.roster(orgId),
    queryFn: async () => (await api.get<RosterEntry[]>(`/organizations/${orgId}/roster`)).data,
    refetchInterval: 30_000,
  });
}

export function useDispatchControl(orgId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'start' | 'stop') =>
      (await api.post(`/organizations/${orgId}/tasks/${taskId}/dispatch${action === 'stop' ? '/stop' : ''}`, {})).data,
    onSettled: () => qc.invalidateQueries({ queryKey: workKeys.all(orgId) }),
  });
}
