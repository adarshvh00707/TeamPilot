import type { ManagerDashboard } from '@teampilot/shared';
import type { Queryable } from '../db/types';

const OPEN_TASK = `('SCHEDULED', 'DISPATCHING', 'PARTIALLY_STAFFED', 'FULLY_STAFFED', 'NEEDS_MANAGER_ATTENTION', 'IN_PROGRESS')`;

/** Live operations snapshot plus 7-day trends, computed in one round trip. Days are in the org's time zone. */
export async function getManagerDashboard(db: Queryable, organizationId: string): Promise<ManagerDashboard> {
  const { rows } = await db.query<{
    required: number | string;
    staffed: number | string;
    open_tasks: number | string;
    needs_attention: number | string;
    open_offers: number | string;
    staff_total: number | string;
    clocked_in: number | string;
    on_break: number | string;
    offers_sent: number | string;
    offers_accepted: number | string;
    median_response_seconds: number | string | null;
    completed_by_day: Array<{ day: string; completed: number }>;
  }>(
    `with org as (select timezone from organizations where id = $1),
     open_tasks as (
       select t.id, t.required_headcount, t.status,
              least(t.required_headcount, (select count(*) from task_assignments a
                                            where a.task_id = t.id and a.status in ('ACCEPTED', 'IN_PROGRESS'))) as staffed
       from tasks t where t.organization_id = $1 and t.status in ${OPEN_TASK}
     ),
     days as (
       select ((now() at time zone org.timezone)::date - g) as day from org, generate_series(0, 6) g
     )
     select
       coalesce((select sum(required_headcount) from open_tasks), 0) as required,
       coalesce((select sum(staffed) from open_tasks), 0) as staffed,
       (select count(*) from open_tasks) as open_tasks,
       (select count(*) from open_tasks where status = 'NEEDS_MANAGER_ATTENTION') as needs_attention,
       (select count(*) from task_offers where organization_id = $1 and offer_status = 'OFFERED' and expires_at > now()) as open_offers,
       (select count(*) from memberships where organization_id = $1 and status = 'ACTIVE' and role = 'STAFF') as staff_total,
       (select count(distinct user_id) from attendance_records
         where organization_id = $1 and clock_in_at is not null and clock_out_at is null) as clocked_in,
       (select count(*) from break_records where organization_id = $1 and status = 'ACTIVE') as on_break,
       (select count(*) from task_offers where organization_id = $1 and offered_at > now() - interval '7 days') as offers_sent,
       (select count(*) from task_offers where organization_id = $1 and offered_at > now() - interval '7 days'
          and offer_status = 'ACCEPTED') as offers_accepted,
       (select percentile_cont(0.5) within group (order by extract(epoch from responded_at - offered_at))
          from task_offers where organization_id = $1 and offered_at > now() - interval '7 days'
          and offer_status in ('ACCEPTED', 'DECLINED')) as median_response_seconds,
       (select coalesce(json_agg(json_build_object('day', d.day::text, 'completed', (
           select count(*) from task_assignments a
           where a.organization_id = $1 and a.status = 'COMPLETED'
             and (a.completed_at at time zone org.timezone)::date = d.day)) order by d.day), '[]'::json)
          from days d, org) as completed_by_day`,
    [organizationId],
  );
  const r = rows[0]!;
  const n = (v: number | string | null) => Number(v ?? 0);
  return {
    staffing: { required: n(r.required), staffed: n(r.staffed), openTasks: n(r.open_tasks), needsAttention: n(r.needs_attention) },
    offers: {
      open: n(r.open_offers),
      sentLast7Days: n(r.offers_sent),
      acceptedLast7Days: n(r.offers_accepted),
      medianResponseSeconds: r.median_response_seconds === null ? null : Math.round(n(r.median_response_seconds)),
    },
    people: { staff: n(r.staff_total), clockedIn: n(r.clocked_in), onBreak: n(r.on_break) },
    completedByDay: (r.completed_by_day ?? []).map((d) => ({ day: d.day, completed: Number(d.completed) })),
  };
}
