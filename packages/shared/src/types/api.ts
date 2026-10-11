import type {
  AssignmentSource,
  AssignmentStatus,
  EventStatus,
  MembershipStatus,
  Priority,
  Role,
  TaskStatus,
} from '../constants/domain';

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

export interface Event {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  locationId: string | null;
  locationName: string | null;
  status: EventStatus;
  priority: Priority;
  createdBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
}

export interface Task {
  id: string;
  organizationId: string;
  eventId: string | null;
  title: string;
  description: string | null;
  locationId: string | null;
  locationName: string | null;
  status: TaskStatus;
  priority: Priority;
  estimatedDurationMinutes: number | null;
  requiredHeadcount: number;
  minimumRequiredHeadcount: number | null;
  completionDeadline: string | null;
  dispatchStartAt: string | null;
  offerResponseWindowMinutes: number;
  requiredSkills: string[];
  instructions: string | null;
  ownerUserId: string | null;
  createdBy: string | null;
  version: number;
  publishedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Live assignments (not cancelled) and those that count toward staffing (accepted or later). */
  staffing: { assigned: number; staffed: number };
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  userId: string;
  displayName: string | null;
  status: AssignmentStatus;
  assignmentSource: AssignmentSource;
  overrideReason: string | null;
  assignedBy: string | null;
  assignedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface TaskDetail extends Task {
  event: Pick<Event, 'id' | 'title' | 'startAt' | 'endAt' | 'timezone' | 'status'> | null;
  assignments: TaskAssignment[];
}

export interface EventDetail extends Event {
  tasks: Task[];
}

export interface ScheduleItem {
  assignment: Pick<TaskAssignment, 'id' | 'status' | 'assignmentSource' | 'assignedAt' | 'acceptedAt' | 'startedAt' | 'completedAt'>;
  task: Pick<
    Task,
    'id' | 'title' | 'status' | 'priority' | 'instructions' | 'locationName' | 'completionDeadline' | 'dispatchStartAt' | 'estimatedDurationMinutes'
  >;
  event: Pick<Event, 'id' | 'title' | 'startAt' | 'endAt' | 'timezone'> | null;
  /** Best-known time for ordering: event start, then dispatch start, then deadline, then assignment time. */
  sortAt: string;
}
