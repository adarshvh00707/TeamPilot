export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

/** Higher rank = more privilege. */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 40,
  ADMIN: 30,
  MANAGER: 20,
  STAFF: 10,
};

export function hasRoleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const TASK_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'DISPATCHING',
  'PARTIALLY_STAFFED',
  'FULLY_STAFFED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NEEDS_MANAGER_ATTENTION',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const OFFER_STATUSES = ['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REASSIGNMENT_REQUIRED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_SOURCES = ['OFFER', 'MANAGER', 'MANAGER_OVERRIDE', 'IMPORT'] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

/** Task states a manager may set directly; staffing states are derived from assignments. */
export const MANUAL_TASK_TARGETS = ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const AVAILABILITY_STATUSES = [
  'OFF_SHIFT',
  'UNKNOWN',
  'AVAILABLE',
  'WORKING',
  'ON_BREAK',
  'UNAVAILABLE',
  'PENDING_ACCEPTANCE',
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const ATTENDANCE_VERIFICATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'MANUAL', 'STALE', 'UNKNOWN'] as const;
export type AttendanceVerificationStatus = (typeof ATTENDANCE_VERIFICATION_STATUSES)[number];

export const ATTENDANCE_SOURCES = ['SLING', 'MANUAL', 'MANAGER', 'SYSTEM'] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

/** Types double as `notificationPreferences` keys; setting one to false turns off its push (in-app is kept). */
export const NOTIFICATION_TYPES = [
  'TASK_OFFER',
  'TASK_ASSIGNED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_REMINDER',
  'SCHEDULE_CHANGE',
  'TASK_REASSIGNMENT',
  'OFFER_EXPIRED',
  'OFFER_WITHDRAWN',
  'ESCALATION',
  'BREAK_ALERT',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'INVITATION',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_JOB_STATUSES = ['QUEUED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export type NotificationJobStatus = (typeof NOTIFICATION_JOB_STATUSES)[number];
