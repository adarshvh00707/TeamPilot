import { z } from 'zod';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createLocationSchema,
  createOrganizationSchema,
  updateLocationSchema,
  updateMembershipSchema,
  updateOrganizationSchema,
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
