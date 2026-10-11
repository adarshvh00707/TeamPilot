import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAssignmentInput,
  CreateEventInput,
  CreateTaskInput,
  Event,
  EventDetail,
  EventStatus,
  ScheduleItem,
  Task,
  TaskAssignment,
  TaskDetail,
  TaskStatus,
  TaskTransitionInput,
} from '@teampilot/shared';
import { api } from '@/lib/api';

export const workKeys = {
  all: (orgId: string) => ['org', orgId, 'work'] as const,
  events: (orgId: string) => ['org', orgId, 'work', 'events'] as const,
  event: (orgId: string, id: string) => ['org', orgId, 'work', 'event', id] as const,
  tasks: (orgId: string, status?: TaskStatus) => ['org', orgId, 'work', 'tasks', status ?? 'all'] as const,
  task: (orgId: string, id: string) => ['org', orgId, 'work', 'task', id] as const,
  schedule: (orgId: string) => ['org', orgId, 'work', 'schedule'] as const,
};

/** Any write can change events, tasks, staffing, and schedules, so refresh the whole work cache. */
function useInvalidateWork(orgId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: workKeys.all(orgId) });
}

export function useEvents(orgId: string) {
  return useInfiniteQuery({
    queryKey: workKeys.events(orgId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const qs = new URLSearchParams({ limit: '25', from, ...(pageParam ? { cursor: pageParam } : {}) });
      return api.get<Event[]>(`/organizations/${orgId}/events?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export function useEvent(orgId: string, id: string) {
  return useQuery({
    queryKey: workKeys.event(orgId, id),
    queryFn: async () => (await api.get<EventDetail>(`/organizations/${orgId}/events/${id}`)).data,
  });
}

export function useCreateEvent(orgId: string) {
  const invalidate = useInvalidateWork(orgId);
  return useMutation({
    mutationFn: async (input: CreateEventInput) => (await api.post<Event>(`/organizations/${orgId}/events`, input)).data,
    onSuccess: invalidate,
  });
}

export function useTransitionEvent(orgId: string, id: string) {
  const invalidate = useInvalidateWork(orgId);
  return useMutation({
    mutationFn: async (status: EventStatus) =>
      (await api.post<Event>(`/organizations/${orgId}/events/${id}/transition`, { status })).data,
    onSuccess: invalidate,
  });
}

export function useTasks(orgId: string, status?: TaskStatus) {
  return useInfiniteQuery({
    queryKey: workKeys.tasks(orgId, status),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '25', ...(status ? { status } : {}), ...(pageParam ? { cursor: pageParam } : {}) });
      return api.get<Task[]>(`/organizations/${orgId}/tasks?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export function useTask(orgId: string, id: string) {
  return useQuery({
    queryKey: workKeys.task(orgId, id),
    queryFn: async () => (await api.get<TaskDetail>(`/organizations/${orgId}/tasks/${id}`)).data,
  });
}

export function useCreateTask(orgId: string) {
  const invalidate = useInvalidateWork(orgId);
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => (await api.post<Task>(`/organizations/${orgId}/tasks`, input)).data,
    onSuccess: invalidate,
  });
}

export function useTransitionTask(orgId: string, id: string) {
  const invalidate = useInvalidateWork(orgId);
  return useMutation({
    mutationFn: async (input: TaskTransitionInput) =>
      (await api.post<Task>(`/organizations/${orgId}/tasks/${id}/transition`, input)).data,
    onSuccess: invalidate,
  });
}

export function useAssign(orgId: string, taskId: string) {
  const invalidate = useInvalidateWork(orgId);
  return useMutation({
    mutationFn: async (input: CreateAssignmentInput) =>
      (await api.post<TaskAssignment>(`/organizations/${orgId}/tasks/${taskId}/assignments`, input)).data,
    onSuccess: invalidate,
  });
}

export type AssignmentAction = 'accept' | 'decline' | 'start' | 'complete' | 'cancel';

export function useAssignmentAction(orgId: string) {
  const invalidate = useInvalidateWork(orgId);
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: AssignmentAction }) =>
      (await api.post<TaskAssignment>(`/organizations/${orgId}/assignments/${id}/${action}`)).data,
    onSuccess: invalidate,
  });
}

/** Without a range: from yesterday onward, open work only. With a range: everything in it, including completed. */
export function useSchedule(orgId: string, range?: { from: Date; to: Date }) {
  return useQuery({
    queryKey: [...workKeys.schedule(orgId), range?.from.toISOString() ?? 'upcoming'],
    queryFn: async () => {
      const qs = new URLSearchParams(
        range
          ? { from: range.from.toISOString(), to: range.to.toISOString(), includeCompleted: 'true' }
          : { from: new Date(Date.now() - 86_400_000).toISOString() },
      );
      return (await api.get<ScheduleItem[]>(`/organizations/${orgId}/schedule?${qs.toString()}`)).data;
    },
    placeholderData: (prev) => prev,
  });
}
