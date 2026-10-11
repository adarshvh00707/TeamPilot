-- TeamPilot AI core schema.
-- All operational timestamps are timestamptz (stored UTC). IANA timezone ids are kept alongside where relevant.

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity and organization
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$' and char_length(slug) between 3 and 64),
  timezone text not null default 'UTC',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_url text,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MANAGER', 'STAFF')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'ACTIVE';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('OWNER', 'ADMIN', 'MANAGER', 'STAFF')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_open_unique
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index locations_org_name_unique on public.locations (organization_id, lower(name));

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,64}$'),
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.member_skills (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- Events and tasks
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null,
  location_id uuid references public.locations (id) on delete set null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index events_org_start_idx on public.events (organization_id, start_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  location_id uuid references public.locations (id) on delete set null,
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SCHEDULED', 'DISPATCHING', 'PARTIALLY_STAFFED', 'FULLY_STAFFED',
    'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NEEDS_MANAGER_ATTENTION')),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes between 1 and 1440),
  required_headcount integer not null default 1 check (required_headcount between 1 and 500),
  minimum_required_headcount integer check (minimum_required_headcount is null or minimum_required_headcount >= 1),
  completion_deadline timestamptz,
  dispatch_start_at timestamptz,
  offer_response_window_minutes integer not null default 10 check (offer_response_window_minutes between 1 and 1440),
  dispatch_policy jsonb not null default '{}'::jsonb,
  escalation_policy jsonb not null default '{}'::jsonb,
  reminder_policy jsonb not null default '{}'::jsonb,
  required_skills text[] not null default '{}',
  instructions text,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  published_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_required_headcount is null or minimum_required_headcount <= required_headcount)
);
create index tasks_org_status_idx on public.tasks (organization_id, status);
create index tasks_org_deadline_idx on public.tasks (organization_id, completion_deadline);
create index tasks_event_idx on public.tasks (event_id);

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  template jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.dispatch_rounds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  round_status text not null default 'RUNNING' check (round_status in ('PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED')),
  required_positions integer not null check (required_positions >= 0),
  eligible_candidates_count integer not null default 0,
  selected_candidates uuid[] not null default '{}',
  decision_metadata jsonb not null default '{}'::jsonb,
  unique (task_id, round_number)
);

create table public.task_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_status text not null default 'OFFERED' check (offer_status in ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response_reason text check (response_reason is null or response_reason in (
    'ACCEPTED', 'NOT_INTERESTED', 'BUSY', 'ON_BREAK', 'UNAVAILABLE', 'LACKS_SKILL', 'OTHER',
    'CAPACITY_FILLED', 'TASK_CANCELLED', 'TASK_CHANGED', 'EXPIRED')),
  dispatch_round_id uuid references public.dispatch_rounds (id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (expires_at > offered_at)
);
create unique index task_offers_one_active_per_user
  on public.task_offers (task_id, user_id) where offer_status = 'OFFERED';
create index task_offers_user_status_idx on public.task_offers (user_id, offer_status);
create index task_offers_expiry_idx on public.task_offers (expires_at) where offer_status = 'OFFERED';

create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_id uuid references public.task_offers (id) on delete set null,
  status text not null default 'ASSIGNED' check (status in (
    'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REASSIGNMENT_REQUIRED')),
  assignment_source text not null check (assignment_source in ('OFFER', 'MANAGER', 'MANAGER_OVERRIDE', 'IMPORT')),
  override_reason text,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assignment_source <> 'MANAGER_OVERRIDE' or override_reason is not null)
);
create unique index task_assignments_one_live_per_user
  on public.task_assignments (task_id, user_id) where status not in ('CANCELLED', 'REASSIGNMENT_REQUIRED');
create index task_assignments_user_status_idx on public.task_assignments (user_id, status);
create index task_assignments_task_status_idx on public.task_assignments (task_id, status);

-- ---------------------------------------------------------------------------
-- Attendance and availability
-- ---------------------------------------------------------------------------
create table public.provider_member_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('SLING', 'MICROSOFT_TEAMS')),
  external_user_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, external_user_id),
  unique (organization_id, provider, user_id)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('SLING', 'MANUAL', 'MANAGER', 'SYSTEM')),
  external_record_id text,
  shift_id text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  verification_status text not null default 'UNKNOWN' check (verification_status in ('VERIFIED', 'UNVERIFIED', 'MANUAL', 'STALE', 'UNKNOWN')),
  recorded_by uuid references auth.users (id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out_at is null or clock_in_at is null or clock_out_at >= clock_in_at)
);
create unique index attendance_external_unique
  on public.attendance_records (organization_id, source, external_record_id) where external_record_id is not null;
create index attendance_org_user_idx on public.attendance_records (organization_id, user_id, clock_in_at desc);

create table public.availability_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  availability_status text not null check (availability_status in (
    'OFF_SHIFT', 'UNKNOWN', 'AVAILABLE', 'WORKING', 'ON_BREAK', 'UNAVAILABLE', 'PENDING_ACCEPTANCE')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source text not null check (source in ('SLING', 'MANUAL', 'MANAGER', 'SYSTEM', 'EMPLOYEE')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index availability_org_user_idx on public.availability_records (organization_id, user_id, starts_at desc);

create table public.break_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  expected_end_at timestamptz not null,
  actual_end_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED', 'CANCELLED')),
  source text not null check (source in ('SLING', 'EMPLOYEE', 'MANAGER', 'SYSTEM')),
  created_at timestamptz not null default now(),
  check (expected_end_at > started_at),
  check (actual_end_at is null or actual_end_at >= started_at)
);
create unique index break_records_one_active
  on public.break_records (organization_id, user_id) where status = 'ACTIVE';

create table public.attendance_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sync_status text not null default 'RUNNING' check (sync_status in ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
  last_successful_sync_at timestamptz,
  error_summary text
);
create index attendance_sync_runs_org_idx on public.attendance_sync_runs (organization_id, started_at desc);

create table public.workload_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  computed_at timestamptz not null default now(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  assigned_minutes integer not null default 0,
  completed_minutes integer not null default 0,
  accepted_count integer not null default 0,
  high_priority_count integer not null default 0,
  adjusted_score numeric(10, 3) not null default 0,
  inputs jsonb not null default '{}'::jsonb
);
create index workload_snapshots_org_user_idx on public.workload_snapshots (organization_id, user_id, computed_at desc);

-- ---------------------------------------------------------------------------
-- Notifications and integrations
-- ---------------------------------------------------------------------------
create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  push_token text not null unique,
  installation_identifier text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVALID', 'REVOKED')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_devices_user_idx on public.notification_devices (user_id) where status = 'ACTIVE';

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  assignment_id uuid references public.task_assignments (id) on delete cascade,
  offer_id uuid references public.task_offers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'CANCELLED')),
  idempotency_key text not null unique,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_jobs_due_idx on public.notification_jobs (scheduled_at) where status = 'QUEUED';

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  notification_job_id uuid references public.notification_jobs (id) on delete set null,
  user_id uuid references auth.users (id) on delete cascade,
  channel text not null check (channel in ('PUSH', 'IN_APP', 'EMAIL', 'TEAMS')),
  provider_message_id text,
  status text not null check (status in ('ACCEPTED', 'DELIVERED', 'FAILED')),
  error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index in_app_notifications_user_idx on public.in_app_notifications (user_id, created_at desc);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('SLING', 'MICROSOFT_TEAMS', 'RESEND')),
  external_tenant_id text,
  status text not null default 'DISCONNECTED' check (status in ('DISCONNECTED', 'PENDING', 'CONNECTED', 'ERROR', 'REVOKED')),
  granted_scopes text[] not null default '{}',
  credential_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')),
  error_summary text,
  unique (provider, external_event_id)
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  topic text not null,
  payload jsonb not null,
  dedupe_key text unique,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
create index outbox_pending_idx on public.outbox_events (available_at) where processed_at is null;

-- ---------------------------------------------------------------------------
-- AI, auditing, billing
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  storage_path text not null unique,
  filename text not null,
  content_type text not null check (content_type in (
    'application/pdf', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes integer not null check (size_bytes > 0),
  processing_status text not null default 'UPLOADED' check (processing_status in (
    'UPLOADED', 'PROCESSING', 'EXTRACTED', 'APPROVED', 'FAILED')),
  extraction_result jsonb,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  operation text not null,
  provider text not null,
  usage_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_usage_logs_org_idx on public.ai_usage_logs (organization_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  billing_provider text not null default 'NONE' check (billing_provider in ('NONE', 'STRIPE')),
  plan text not null default 'FREE' check (plan in ('FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS')),
  status text not null default 'INACTIVE' check (status in ('INACTIVE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED')),
  external_customer_id text,
  external_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'memberships', 'teams', 'locations', 'events', 'tasks', 'task_templates',
    'task_assignments', 'attendance_records', 'availability_records', 'notification_devices',
    'notification_jobs', 'integrations', 'documents', 'subscriptions'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile bootstrap for new auth users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
