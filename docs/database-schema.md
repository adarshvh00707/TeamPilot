# Database schema

Migrations live in `supabase/migrations` and are applied in filename order.

| Migration | Contents |
| --- | --- |
| `20261011000001_core_schema.sql` | All tables, constraints, indexes, `updated_at` triggers, profile bootstrap trigger on `auth.users`. |
| `20261011000002_rls_policies.sql` | RLS on every public table, helper functions in the `private` schema, column-level grants. |
| `20261011000003_storage.sql` | Private `documents` bucket and read policy (skipped where Supabase Storage is absent). |

## Conventions

- UUID primary keys (`gen_random_uuid()`), `timestamptz` for all instants (stored UTC), IANA timezone strings alongside events/organizations.
- Status columns are `text` with explicit `CHECK` constraints mirroring `packages/shared/src/constants/domain.ts`.
- Every tenant-owned row carries `organization_id` with `ON DELETE CASCADE` from `organizations`.

## Tables by area

- **Identity & org**: `organizations`, `profiles`, `memberships` (unique per org+user), `invitations` (only `token_hash` stored; one open invitation per org+email), `teams`, `team_members`, `locations` (case-insensitive unique name per org), `skills`, `member_skills`.
- **Events & tasks**: `events` (`end_at > start_at`), `tasks` (headcount/minimum checks, dispatch/escalation/reminder policy JSON, `version` for change detection), `task_dependencies`, `task_templates`, `dispatch_rounds`, `task_offers`, `task_assignments`.
- **Attendance**: `provider_member_mappings`, `attendance_records` (source + verification status + `last_synced_at`), `availability_records`, `break_records`, `attendance_sync_runs`, `workload_snapshots`.
- **Notifications & integrations**: `notification_devices`, `notification_jobs` (idempotency key, attempts, retry time), `notification_logs`, `in_app_notifications`, `integrations` (credential *reference* only), `webhook_events` (unique provider+event id), `outbox_events`.
- **AI, audit, billing**: `documents`, `ai_usage_logs`, `audit_logs`, `subscriptions`.

## Concurrency guarantees enforced by the schema

| Guarantee | Mechanism |
| --- | --- |
| One active offer per user per task | partial unique index `task_offers_one_active_per_user` |
| One live assignment per user per task | partial unique index `task_assignments_one_live_per_user` |
| One active break per user per org | partial unique index `break_records_one_active` |
| Idempotent offers / notification jobs / webhooks | unique `idempotency_key`, unique `(provider, external_event_id)` |
| Manager overrides are justified | `CHECK (assignment_source <> 'MANAGER_OVERRIDE' OR override_reason IS NOT NULL)` |

Headcount capacity (not over-assigning a task) is enforced in the acceptance transaction by locking the task row; it arrives with the dispatch engine in Phase 3.
