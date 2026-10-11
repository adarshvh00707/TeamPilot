import { z } from 'zod';
import {
  acceptInvitationSchema,
  createAssignmentSchema,
  createEventSchema,
  createInvitationSchema,
  createTaskSchema,
  eventTransitionSchema,
  taskTransitionSchema,
  updateEventSchema,
  updateTaskSchema,
  createLocationSchema,
  createOrganizationSchema,
  updateLocationSchema,
  updateMembershipSchema,
  updateOrganizationSchema,
  registerDeviceSchema,
  updateProfileSchema,
} from '@teampilot/shared';

interface Operation {
  method: 'get' | 'post' | 'patch';
  path: string;
  summary: string;
  tag: string;
  body?: z.ZodType;
  auth?: boolean;
  minRole?: string;
}

const ORG = '/api/v1/organizations/{organizationId}';

const operations: Operation[] = [
  { method: 'get', path: '/health', summary: 'Liveness probe', tag: 'System', auth: false },
  { method: 'get', path: '/ready', summary: 'Readiness probe (checks database)', tag: 'System', auth: false },
  { method: 'get', path: '/api/v1/me', summary: 'Current user profile and memberships', tag: 'Me' },
  { method: 'patch', path: '/api/v1/me', summary: 'Update own profile', tag: 'Me', body: updateProfileSchema },
  { method: 'post', path: '/api/v1/invitations/accept', summary: 'Accept an invitation', tag: 'Invitations', body: acceptInvitationSchema },
  { method: 'get', path: '/api/v1/organizations', summary: 'List my organizations', tag: 'Organizations' },
  { method: 'post', path: '/api/v1/organizations', summary: 'Create organization (caller becomes OWNER)', tag: 'Organizations', body: createOrganizationSchema },
  { method: 'get', path: ORG, summary: 'Get organization', tag: 'Organizations', minRole: 'STAFF' },
  { method: 'patch', path: ORG, summary: 'Update organization', tag: 'Organizations', body: updateOrganizationSchema, minRole: 'ADMIN' },
  { method: 'get', path: `${ORG}/members`, summary: 'List members', tag: 'Members', minRole: 'STAFF' },
  { method: 'get', path: `${ORG}/members/{userId}`, summary: 'Get member', tag: 'Members', minRole: 'STAFF' },
  { method: 'patch', path: `${ORG}/members/{userId}`, summary: 'Change member role/status', tag: 'Members', body: updateMembershipSchema, minRole: 'ADMIN' },
  { method: 'get', path: `${ORG}/invitations`, summary: 'List open invitations', tag: 'Invitations', minRole: 'ADMIN' },
  { method: 'post', path: `${ORG}/invitations`, summary: 'Create invitation (token returned once)', tag: 'Invitations', body: createInvitationSchema, minRole: 'ADMIN' },
  { method: 'post', path: `${ORG}/invitations/{invitationId}/revoke`, summary: 'Revoke invitation', tag: 'Invitations', minRole: 'ADMIN' },
  { method: 'get', path: `${ORG}/locations`, summary: 'List locations', tag: 'Locations', minRole: 'STAFF' },
  { method: 'get', path: `${ORG}/locations/{locationId}`, summary: 'Get location', tag: 'Locations', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/locations`, summary: 'Create location', tag: 'Locations', body: createLocationSchema, minRole: 'MANAGER' },
  { method: 'patch', path: `${ORG}/locations/{locationId}`, summary: 'Update or archive location', tag: 'Locations', body: updateLocationSchema, minRole: 'MANAGER' },
  { method: 'get', path: `${ORG}/events`, summary: 'List events (drafts hidden from staff)', tag: 'Events', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/events`, summary: 'Create event (DRAFT)', tag: 'Events', body: createEventSchema, minRole: 'MANAGER' },
  { method: 'get', path: `${ORG}/events/{eventId}`, summary: 'Get event with its tasks', tag: 'Events', minRole: 'STAFF' },
  { method: 'patch', path: `${ORG}/events/{eventId}`, summary: 'Update event', tag: 'Events', body: updateEventSchema, minRole: 'MANAGER' },
  { method: 'post', path: `${ORG}/events/{eventId}/transition`, summary: 'Change event status (cancel cascades to tasks)', tag: 'Events', body: eventTransitionSchema, minRole: 'MANAGER' },
  { method: 'get', path: `${ORG}/tasks`, summary: 'List tasks (drafts hidden from staff)', tag: 'Tasks', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/tasks`, summary: 'Create task (DRAFT)', tag: 'Tasks', body: createTaskSchema, minRole: 'MANAGER' },
  { method: 'get', path: `${ORG}/tasks/{taskId}`, summary: 'Get task with assignments', tag: 'Tasks', minRole: 'STAFF' },
  { method: 'patch', path: `${ORG}/tasks/{taskId}`, summary: 'Update task (optional expectedVersion)', tag: 'Tasks', body: updateTaskSchema, minRole: 'MANAGER' },
  { method: 'post', path: `${ORG}/tasks/{taskId}/transition`, summary: 'Change task status', tag: 'Tasks', body: taskTransitionSchema, minRole: 'MANAGER' },
  { method: 'post', path: `${ORG}/tasks/{taskId}/assignments`, summary: 'Assign a member (override reason needed past headcount)', tag: 'Assignments', body: createAssignmentSchema, minRole: 'MANAGER' },
  ...(['accept', 'decline', 'start', 'complete'] as const).map((a) => ({
    method: 'post' as const,
    path: `${ORG}/assignments/{assignmentId}/${a}`,
    summary: `${a[0]!.toUpperCase()}${a.slice(1)} own assignment`,
    tag: 'Assignments',
    minRole: 'STAFF',
  })),
  { method: 'post', path: `${ORG}/assignments/{assignmentId}/cancel`, summary: 'Cancel an assignment', tag: 'Assignments', minRole: 'MANAGER' },
  { method: 'get', path: `${ORG}/schedule`, summary: 'My upcoming assignments', tag: 'Schedule', minRole: 'STAFF' },
  { method: 'get', path: `${ORG}/me/availability`, summary: 'My availability (manual clock-ins are unverified)', tag: 'Availability', minRole: 'STAFF' },
  ...(['clock-in', 'clock-out', 'pause', 'resume', 'breaks/start', 'breaks/end'] as const).map((a) => ({
    method: 'post' as const,
    path: `${ORG}/me/${a}`,
    summary: `Availability: ${a.replace('/', ' ')}`,
    tag: 'Availability',
    minRole: 'STAFF' as const,
  })),
  { method: 'get', path: `${ORG}/roster`, summary: 'Live roster with availability', tag: 'Availability', minRole: 'MANAGER' },
  { method: 'get', path: `${ORG}/me/offers`, summary: 'My open task offers', tag: 'Dispatch', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/offers/{offerId}/accept`, summary: 'Accept an offer (first come, first served)', tag: 'Dispatch', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/offers/{offerId}/decline`, summary: 'Decline an offer', tag: 'Dispatch', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/tasks/{taskId}/dispatch`, summary: 'Start automatic dispatch', tag: 'Dispatch', minRole: 'MANAGER' },
  { method: 'post', path: `${ORG}/tasks/{taskId}/dispatch/stop`, summary: 'Stop dispatch and withdraw open offers', tag: 'Dispatch', minRole: 'MANAGER' },
  { method: 'post', path: '/api/v1/me/devices', summary: 'Register an Expo push token', tag: 'Notifications', body: registerDeviceSchema },
  { method: 'post', path: '/api/v1/me/devices/revoke', summary: 'Stop push to a device (sign-out)', tag: 'Notifications' },
  { method: 'get', path: `${ORG}/notifications`, summary: 'My in-app notifications (meta.unread)', tag: 'Notifications', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/notifications/read-all`, summary: 'Mark all notifications read', tag: 'Notifications', minRole: 'STAFF' },
  { method: 'post', path: `${ORG}/notifications/{notificationId}/read`, summary: 'Mark a notification read', tag: 'Notifications', minRole: 'STAFF' },
];

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
        requestId: { type: 'string' },
      },
    },
  },
};

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }));
    paths[op.path] ??= {};
    paths[op.path]![op.method] = {
      tags: [op.tag],
      summary: op.minRole ? `${op.summary} [min role: ${op.minRole}]` : op.summary,
      ...(op.auth === false ? { security: [] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(op.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(op.body, { io: 'input', unrepresentable: 'any' }) } } } }
        : {}),
      responses: {
        '2XX': { description: 'Success. Body: { data, meta? }' },
        default: { description: 'Error', content: { 'application/json': { schema: errorSchema } } },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'TeamPilot AI API', version: '0.1.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    security: [{ bearerAuth: [] }],
    paths,
  };
}
