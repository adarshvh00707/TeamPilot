import {
  deriveAvailability,
  type AttendanceVerificationStatus,
  type DispatchCandidate,
  type MyAvailability,
  type Role,
} from '@teampilot/shared';
import type { Queryable } from '../db/types';
import { iso, isoOrNull } from '../utils/pagination';

interface SignalRow {
  user_id: string;
  display_name: string | null;
  role: Role;
  open_attendance: AttendanceVerificationStatus | null;
  clocked_in_at: Date | string | null;
  paused: boolean;
  break_id: string | null;
  break_started_at: Date | string | null;
  break_expected_end_at: Date | string | null;
  working: boolean;
  has_open_offer: boolean;
  active_assignments: number | string;
  skills: string[];
  recent_minutes: number | string;
  accepted_today: number | string;
  high_priority_recent: number | string;
  already_offered: boolean;
  live_on_task: boolean;
  has_conflict: boolean;
}

export interface MemberSignals {
  userId: string;
  displayName: string | null;
  role: Role;
  availability: MyAvailability;
  activeAssignments: number;
  candidate: DispatchCandidate;
}

/** A task's time window: event times if attached, else dispatch start plus duration (30 min default). */
const TASK_WINDOW = `
  select coalesce(e.start_at, t.dispatch_start_at, now()) as ws,
         coalesce(e.end_at, coalesce(e.start_at, t.dispatch_start_at, now())
                  + make_interval(mins => coalesce(t.estimated_duration_minutes, 30))) as we
  from tasks t left join events e on e.id = t.event_id`;

/**
 * Everything needed to derive availability and dispatch eligibility for active members, in one query.
 * Task-specific flags are false when taskId is null.
 */
export async function loadMemberSignals(
  db: Queryable,
  organizationId: string,
  opts: { taskId?: string | null; userId?: string } = {},
): Promise<MemberSignals[]> {
  const { rows } = await db.query<SignalRow>(
    `with target as (${TASK_WINDOW} where t.id = $2::uuid)
     select m.user_id, p.display_name, m.role,
       att.verification_status as open_attendance, att.clock_in_at as clocked_in_at,
       exists (select 1 from availability_records v
               where v.organization_id = $1 and v.user_id = m.user_id and v.availability_status = 'UNAVAILABLE'
                 and v.starts_at <= now() and (v.ends_at is null or v.ends_at > now())) as paused,
       br.id as break_id, br.started_at as break_started_at, br.expected_end_at as break_expected_end_at,
       exists (select 1 from task_assignments a
               where a.organization_id = $1 and a.user_id = m.user_id and a.status = 'IN_PROGRESS') as working,
       exists (select 1 from task_offers o
               where o.organization_id = $1 and o.user_id = m.user_id and o.offer_status = 'OFFERED'
                 and o.expires_at > now()) as has_open_offer,
       (select count(*) from task_assignments a
         where a.organization_id = $1 and a.user_id = m.user_id and a.status in ('ACCEPTED', 'IN_PROGRESS')) as active_assignments,
       coalesce(array(select s.key from member_skills ms join skills s on s.id = ms.skill_id
                      where ms.organization_id = $1 and ms.user_id = m.user_id), '{}') as skills,
       coalesce((select sum(coalesce(t.estimated_duration_minutes, 30)) from task_assignments a join tasks t on t.id = a.task_id
                 where a.organization_id = $1 and a.user_id = m.user_id
                   and a.status in ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED') and a.assigned_at > now() - interval '7 days'), 0) as recent_minutes,
       (select count(*) from task_assignments a
         where a.organization_id = $1 and a.user_id = m.user_id
           and a.status in ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED') and a.accepted_at > now() - interval '24 hours') as accepted_today,
       (select count(*) from task_assignments a join tasks t on t.id = a.task_id
         where a.organization_id = $1 and a.user_id = m.user_id and t.priority in ('HIGH', 'CRITICAL')
           and a.status in ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED') and a.assigned_at > now() - interval '7 days') as high_priority_recent,
       ($2::uuid is not null and exists (select 1 from task_offers o where o.task_id = $2::uuid and o.user_id = m.user_id)) as already_offered,
       ($2::uuid is not null and exists (select 1 from task_assignments a where a.task_id = $2::uuid and a.user_id = m.user_id
                                          and a.status not in ('CANCELLED', 'REASSIGNMENT_REQUIRED'))) as live_on_task,
       ($2::uuid is not null and exists (
          select 1 from task_assignments a
          join tasks ot on ot.id = a.task_id
          left join events oe on oe.id = ot.event_id
          cross join target
          where a.organization_id = $1 and a.user_id = m.user_id and a.task_id <> $2::uuid
            and a.status in ('ACCEPTED', 'IN_PROGRESS')
            and coalesce(oe.start_at, ot.dispatch_start_at, a.assigned_at) < target.we
            and coalesce(oe.end_at, coalesce(oe.start_at, ot.dispatch_start_at, a.assigned_at)
                         + make_interval(mins => coalesce(ot.estimated_duration_minutes, 30))) > target.ws)) as has_conflict
     from memberships m
     left join profiles p on p.id = m.user_id
     left join lateral (
       select verification_status, clock_in_at from attendance_records a
       where a.organization_id = $1 and a.user_id = m.user_id and a.clock_in_at is not null and a.clock_out_at is null
       order by a.clock_in_at desc limit 1) att on true
     left join lateral (
       select id, started_at, expected_end_at from break_records b
       where b.organization_id = $1 and b.user_id = m.user_id and b.status = 'ACTIVE' limit 1) br on true
     where m.organization_id = $1 and m.status = 'ACTIVE' and ($3::uuid is null or m.user_id = $3::uuid)
     order by p.display_name nulls last, m.user_id`,
    [organizationId, opts.taskId ?? null, opts.userId ?? null],
  );
  return rows.map((r) => {
    const derived = deriveAvailability({
      onBreak: !!r.break_id,
      paused: r.paused,
      openAttendance: r.open_attendance,
      working: r.working,
      hasOpenOffer: r.has_open_offer,
    });
    const availability: MyAvailability = {
      ...derived,
      clockedInAt: isoOrNull(r.clocked_in_at),
      paused: r.paused,
      activeBreak: r.break_id ? { id: r.break_id, startedAt: iso(r.break_started_at), expectedEndAt: iso(r.break_expected_end_at) } : null,
    };
    return {
      userId: r.user_id,
      displayName: r.display_name,
      role: r.role,
      availability,
      activeAssignments: Number(r.active_assignments),
      candidate: {
        userId: r.user_id,
        role: r.role,
        // A pending offer only matters through hasOpenOffer; eligibility is otherwise judged on presence.
        availability: derived.status === 'PENDING_ACCEPTANCE' ? 'AVAILABLE' : derived.status,
        skills: r.skills ?? [],
        hasOpenOffer: r.has_open_offer,
        alreadyOfferedThisTask: r.already_offered,
        liveOnThisTask: r.live_on_task,
        hasConflict: r.has_conflict,
        workload: {
          recentMinutes: Number(r.recent_minutes),
          acceptedToday: Number(r.accepted_today),
          highPriorityRecent: Number(r.high_priority_recent),
        },
      },
    };
  });
}

export async function getOpenAttendance(db: Queryable, organizationId: string, userId: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id from attendance_records
     where organization_id = $1 and user_id = $2 and clock_in_at is not null and clock_out_at is null
     order by clock_in_at desc limit 1 for update`,
    [organizationId, userId],
  );
  return rows[0] ?? null;
}

/** Self-reported clock-ins are stored as MANUAL and never shown as verified. */
export async function insertClockIn(db: Queryable, organizationId: string, userId: string) {
  await db.query(
    `insert into attendance_records (organization_id, user_id, source, clock_in_at, verification_status, recorded_by)
     values ($1, $2, 'MANUAL', now(), 'MANUAL', $2)`,
    [organizationId, userId],
  );
}

export async function closeAttendance(db: Queryable, organizationId: string, userId: string) {
  await db.query(
    `update attendance_records set clock_out_at = now()
     where organization_id = $1 and user_id = $2 and clock_in_at is not null and clock_out_at is null`,
    [organizationId, userId],
  );
  await endBreak(db, organizationId, userId);
  await endPause(db, organizationId, userId);
}

export async function startPause(db: Queryable, organizationId: string, userId: string, reason: string | null) {
  await endPause(db, organizationId, userId);
  await db.query(
    `insert into availability_records (organization_id, user_id, availability_status, source, reason)
     values ($1, $2, 'UNAVAILABLE', 'EMPLOYEE', $3)`,
    [organizationId, userId, reason],
  );
}

export async function endPause(db: Queryable, organizationId: string, userId: string) {
  await db.query(
    `update availability_records set ends_at = now()
     where organization_id = $1 and user_id = $2 and availability_status = 'UNAVAILABLE'
       and starts_at <= now() and (ends_at is null or ends_at > now())`,
    [organizationId, userId],
  );
}

export async function insertBreak(db: Queryable, organizationId: string, userId: string, minutes: number) {
  await db.query(
    `insert into break_records (organization_id, user_id, expected_end_at, source)
     values ($1, $2, now() + make_interval(mins => $3::int), 'EMPLOYEE')`,
    [organizationId, userId, minutes],
  );
}

export async function endBreak(db: Queryable, organizationId: string, userId: string) {
  const { rowCount } = await db.query(
    `update break_records set status = 'ENDED', actual_end_at = now()
     where organization_id = $1 and user_id = $2 and status = 'ACTIVE'`,
    [organizationId, userId],
  );
  return rowCount > 0;
}
