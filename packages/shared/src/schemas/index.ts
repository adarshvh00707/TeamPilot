import { z } from 'zod';
import { dispatchPolicyInputSchema } from '../dispatch';
import { EVENT_STATUSES, MANUAL_TASK_TARGETS, MEMBERSHIP_STATUSES, PRIORITIES, ROLES, TASK_STATUSES } from '../constants/domain';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const uuidSchema = z.uuid();
export const roleSchema = z.enum(ROLES);
export const timeZoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, 'Invalid IANA timezone');
export const slugSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, 'Use lowercase letters, numbers, and hyphens');

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  timezone: timeZoneSchema,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timezone: timeZoneSchema.optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const updateProfileSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.url().max(2048).nullable().optional(),
    notificationPreferences: z.record(z.string(), z.boolean()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateMembershipSchema = z
  .strictObject({
    role: roleSchema.optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'role or status is required');
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const createInvitationSchema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  role: roleSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

const dateTimeSchema = z.iso.datetime({ offset: true });
const nonEmptyPatch = (v: object) => Object.keys(v).filter((k) => k !== 'expectedVersion').length > 0;

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
    timezone: timeZoneSchema,
    locationId: uuidSchema.optional(),
    priority: z.enum(PRIORITIES).default('NORMAL'),
  })
  .refine((v) => Date.parse(v.endAt) > Date.parse(v.startAt), { message: 'End must be after start', path: ['endAt'] });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    startAt: dateTimeSchema.optional(),
    endAt: dateTimeSchema.optional(),
    timezone: timeZoneSchema.optional(),
    locationId: uuidSchema.nullable().optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine(nonEmptyPatch, 'At least one field is required');
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventTransitionSchema = z.object({ status: z.enum(EVENT_STATUSES) });
export type EventTransitionInput = z.infer<typeof eventTransitionSchema>;

export const listEventsQuerySchema = paginationQuerySchema.extend({
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  status: z.enum(EVENT_STATUSES).optional(),
});

const skillKeySchema = z.string().regex(/^[a-z0-9_-]{1,64}$/, 'Use lowercase skill keys');

export const createTaskSchema = z
  .object({
    eventId: uuidSchema.optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    locationId: uuidSchema.optional(),
    priority: z.enum(PRIORITIES).default('NORMAL'),
    estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
    requiredHeadcount: z.number().int().min(1).max(500).default(1),
    minimumRequiredHeadcount: z.number().int().min(1).max(500).optional(),
    completionDeadline: dateTimeSchema.optional(),
    dispatchStartAt: dateTimeSchema.optional(),
    offerResponseWindowMinutes: z.number().int().min(1).max(1440).default(10),
    requiredSkills: z.array(skillKeySchema).max(20).default([]),
    instructions: z.string().trim().max(5000).optional(),
    ownerUserId: uuidSchema.optional(),
    dispatchPolicy: dispatchPolicyInputSchema.optional(),
  })
  .refine((v) => v.minimumRequiredHeadcount === undefined || v.minimumRequiredHeadcount <= v.requiredHeadcount, {
    message: 'Minimum headcount cannot exceed required headcount',
    path: ['minimumRequiredHeadcount'],
  });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .strictObject({
    /** Optimistic concurrency: rejected with 409 if the task changed since this version. */
    expectedVersion: z.number().int().min(1).optional(),
    eventId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    locationId: uuidSchema.nullable().optional(),
    priority: z.enum(PRIORITIES).optional(),
    estimatedDurationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    requiredHeadcount: z.number().int().min(1).max(500).optional(),
    minimumRequiredHeadcount: z.number().int().min(1).max(500).nullable().optional(),
    completionDeadline: dateTimeSchema.nullable().optional(),
    dispatchStartAt: dateTimeSchema.nullable().optional(),
    offerResponseWindowMinutes: z.number().int().min(1).max(1440).optional(),
    requiredSkills: z.array(skillKeySchema).max(20).optional(),
    instructions: z.string().trim().max(5000).nullable().optional(),
    ownerUserId: uuidSchema.nullable().optional(),
    dispatchPolicy: dispatchPolicyInputSchema.optional(),
  })
  .refine(nonEmptyPatch, 'At least one field is required');
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskTransitionSchema = z.object({
  status: z.enum(MANUAL_TASK_TARGETS),
  expectedVersion: z.number().int().min(1).optional(),
});
export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;

export const listTasksQuerySchema = paginationQuerySchema.extend({
  eventId: uuidSchema.optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export const createAssignmentSchema = z.object({
  userId: uuidSchema,
  /** Required when the task is already at its required headcount. */
  overrideReason: z.string().trim().min(3).max(500).optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const startBreakSchema = z.object({
  minutes: z.number().int().min(5).max(60).default(15),
});
export type StartBreakInput = z.infer<typeof startBreakSchema>;

export const pauseOffersSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type PauseOffersInput = z.infer<typeof pauseOffersSchema>;

export const DECLINE_REASONS = ['NOT_INTERESTED', 'BUSY', 'ON_BREAK', 'UNAVAILABLE', 'LACKS_SKILL', 'OTHER'] as const;
export const declineOfferSchema = z.object({
  reason: z.enum(DECLINE_REASONS).default('NOT_INTERESTED'),
});
export type DeclineOfferInput = z.infer<typeof declineOfferSchema>;

export const scheduleQuerySchema = z.object({
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  includeCompleted: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
