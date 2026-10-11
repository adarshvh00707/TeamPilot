import { Router, type Request } from 'express';
import {
  createAssignmentSchema,
  createEventSchema,
  createTaskSchema,
  eventTransitionSchema,
  hasRoleAtLeast,
  listEventsQuerySchema,
  listTasksQuerySchema,
  scheduleQuerySchema,
  taskTransitionSchema,
  updateEventSchema,
  updateTaskSchema,
  uuidSchema,
} from '@teampilot/shared';
import type { AppDeps } from '../app';
import { requireOrgRole } from '../middleware/org-access';
import { listOffersForTask, listRoundsForTask } from '../repositories/dispatch';
import { getEvent, listEvents } from '../repositories/events';
import { getTask, listAssignmentsForTask, listScheduleForUser, listTasks, listTasksForEvent } from '../repositories/tasks';
import {
  actOnAssignment,
  assignMember,
  createEvent,
  createTask,
  editEvent,
  editTask,
  transitionEvent,
  transitionTask,
  type Actor,
} from '../services/work';
import { notFound } from '../utils/errors';
import { decodeCursor, paginate } from '../utils/pagination';

const idParam = (value: unknown, label: string) => {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw notFound(`${label} not found`);
  return parsed.data;
};

const actorOf = (req: Request): Actor => ({
  organizationId: req.org!.organizationId,
  actorUserId: req.auth!.userId,
  actorRole: req.org!.role,
});

/** Staff never see drafts. */
const canSeeDrafts = (req: Request) => hasRoleAtLeast(req.org!.role, 'MANAGER');

export function workRouter({ db }: AppDeps): Router {
  const r = Router();
  const member = requireOrgRole(db, 'STAFF');
  const manager = requireOrgRole(db, 'MANAGER');
  const ORG = '/organizations/:organizationId';

  // Events
  r.get(`${ORG}/events`, member, async (req, res) => {
    const q = listEventsQuerySchema.parse(req.query);
    const rows = await listEvents(db, req.org!.organizationId, {
      limit: q.limit,
      cursor: decodeCursor(q.cursor),
      from: q.from,
      to: q.to,
      status: q.status,
      includeDrafts: canSeeDrafts(req),
    });
    const page = paginate(rows, q.limit, (e) => ({ t: e.startAt, id: e.id }));
    res.json({ data: page.items, meta: { nextCursor: page.nextCursor } });
  });

  r.post(`${ORG}/events`, manager, async (req, res) => {
    res.status(201).json({ data: await createEvent(db, actorOf(req), createEventSchema.parse(req.body)) });
  });

  r.get(`${ORG}/events/:eventId`, member, async (req, res) => {
    const event = await getEvent(db, req.org!.organizationId, idParam(req.params.eventId, 'Event'));
    if (!event || (event.status === 'DRAFT' && !canSeeDrafts(req))) throw notFound('Event not found');
    const tasks = await listTasksForEvent(db, req.org!.organizationId, event.id, canSeeDrafts(req));
    res.json({ data: { ...event, tasks } });
  });

  r.patch(`${ORG}/events/:eventId`, manager, async (req, res) => {
    const input = updateEventSchema.parse(req.body);
    res.json({ data: await editEvent(db, actorOf(req), idParam(req.params.eventId, 'Event'), input) });
  });

  r.post(`${ORG}/events/:eventId/transition`, manager, async (req, res) => {
    const { status } = eventTransitionSchema.parse(req.body);
    res.json({ data: await transitionEvent(db, actorOf(req), idParam(req.params.eventId, 'Event'), status) });
  });

  // Tasks
  r.get(`${ORG}/tasks`, member, async (req, res) => {
    const q = listTasksQuerySchema.parse(req.query);
    const rows = await listTasks(db, req.org!.organizationId, {
      limit: q.limit,
      cursor: decodeCursor(q.cursor),
      eventId: q.eventId,
      status: q.status,
      includeDrafts: canSeeDrafts(req),
    });
    const page = paginate(rows, q.limit, (t) => ({ t: t.createdAt, id: t.id }));
    res.json({ data: page.items, meta: { nextCursor: page.nextCursor } });
  });

  r.post(`${ORG}/tasks`, manager, async (req, res) => {
    res.status(201).json({ data: await createTask(db, actorOf(req), createTaskSchema.parse(req.body)) });
  });

  r.get(`${ORG}/tasks/:taskId`, member, async (req, res) => {
    const orgId = req.org!.organizationId;
    const task = await getTask(db, orgId, idParam(req.params.taskId, 'Task'));
    if (!task || (task.status === 'DRAFT' && !canSeeDrafts(req))) throw notFound('Task not found');
    const [assignments, event, dispatch] = await Promise.all([
      listAssignmentsForTask(db, orgId, task.id),
      task.eventId ? getEvent(db, orgId, task.eventId) : Promise.resolve(null),
      canSeeDrafts(req)
        ? Promise.all([listRoundsForTask(db, orgId, task.id), listOffersForTask(db, orgId, task.id)]).then(([rounds, offers]) => ({
            policy: task.dispatchPolicy,
            rounds,
            offers,
          }))
        : Promise.resolve(undefined),
    ]);
    res.json({
      data: {
        ...task,
        event: event
          ? { id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt, timezone: event.timezone, status: event.status }
          : null,
        assignments,
        ...(dispatch ? { dispatch } : {}),
      },
    });
  });

  r.patch(`${ORG}/tasks/:taskId`, manager, async (req, res) => {
    const input = updateTaskSchema.parse(req.body);
    res.json({ data: await editTask(db, actorOf(req), idParam(req.params.taskId, 'Task'), input) });
  });

  r.post(`${ORG}/tasks/:taskId/transition`, manager, async (req, res) => {
    const { status, expectedVersion } = taskTransitionSchema.parse(req.body);
    res.json({ data: await transitionTask(db, actorOf(req), idParam(req.params.taskId, 'Task'), status, expectedVersion) });
  });

  // Assignments
  r.post(`${ORG}/tasks/:taskId/assignments`, manager, async (req, res) => {
    const input = createAssignmentSchema.parse(req.body);
    res.status(201).json({ data: await assignMember(db, actorOf(req), idParam(req.params.taskId, 'Task'), input) });
  });

  for (const action of ['accept', 'decline', 'start', 'complete', 'cancel'] as const) {
    r.post(`${ORG}/assignments/:assignmentId/${action}`, member, async (req, res) => {
      res.json({ data: await actOnAssignment(db, actorOf(req), idParam(req.params.assignmentId, 'Assignment'), action) });
    });
  }

  // Personal schedule
  r.get(`${ORG}/schedule`, member, async (req, res) => {
    const q = scheduleQuerySchema.parse(req.query);
    res.json({ data: await listScheduleForUser(db, req.org!.organizationId, req.auth!.userId, q) });
  });

  return r;
}
