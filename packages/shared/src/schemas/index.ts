import { z } from 'zod';
import { MEMBERSHIP_STATUSES, ROLES } from '../constants/domain';

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
