import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InAppNotification } from '@teampilot/shared';
import { api } from '@/lib/api';

export const notificationKeys = { inbox: (orgId: string) => ['org', orgId, 'notifications'] as const };

export function useInbox(orgId: string) {
  return useQuery({
    queryKey: notificationKeys.inbox(orgId),
    queryFn: async () => {
      const res = await api.get<InAppNotification[]>(`/organizations/${orgId}/notifications`);
      return { items: res.data, unread: Number((res.meta as { unread?: number } | undefined)?.unread ?? 0) };
    },
    refetchInterval: 30_000,
  });
}

export function useMarkRead(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id?: string) =>
      api.post(`/organizations/${orgId}/notifications/${id ? `${id}/read` : 'read-all'}`, {}),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.inbox(orgId) }),
  });
}
