-- Row Level Security.
-- Mobile clients may read through Supabase directly where policies allow it. All writes to
-- operational data (memberships, tasks, offers, attendance, breaks) go through the API, which
-- connects with a privileged role and enforces equivalent authorization in its services.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.status = 'ACTIVE'
  );
$$;

create or replace function private.has_org_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid())
      and m.status = 'ACTIVE' and m.role = any (roles)
  );
$$;

create or replace function private.shares_org_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and mine.status = 'ACTIVE'
      and theirs.user_id = other and theirs.status = 'ACTIVE'
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, text[]) from public;
revoke all on function private.shares_org_with(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.shares_org_with(uuid) to authenticated;

-- Enable RLS on every public table. Tables without policies are inaccessible to anon/authenticated.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Anonymous clients get nothing from public tables.
revoke all on all tables in schema public from anon;

-- organizations
create policy organizations_select on public.organizations
  for select to authenticated using (private.is_org_member(id));

-- profiles: own row, or members of a shared organization (directory). Updates only to own row.
create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()) or private.shares_org_with(id));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships: visible to members of the same organization. No direct client writes.
create policy memberships_select on public.memberships
  for select to authenticated using (private.is_org_member(organization_id));

-- invitations: owners/admins only.
create policy invitations_select on public.invitations
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN']));
revoke select on public.invitations from authenticated;
grant select (id, organization_id, email, role, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.invitations to authenticated;

-- teams, locations, skills: readable by members.
create policy teams_select on public.teams
  for select to authenticated using (private.is_org_member(organization_id));
create policy team_members_select on public.team_members
  for select to authenticated using (private.is_org_member(organization_id));
create policy locations_select on public.locations
  for select to authenticated using (private.is_org_member(organization_id));
create policy skills_select on public.skills
  for select to authenticated using (private.is_org_member(organization_id));
create policy member_skills_select on public.member_skills
  for select to authenticated using (
    user_id = (select auth.uid()) or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));

-- events: managers see everything, staff see non-draft events.
create policy events_select on public.events
  for select to authenticated using (
    private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER'])
    or (status <> 'DRAFT' and private.is_org_member(organization_id)));

-- tasks: managers see everything; staff see published tasks.
create policy tasks_select on public.tasks
  for select to authenticated using (
    private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER'])
    or (status <> 'DRAFT' and private.is_org_member(organization_id)));
create policy task_dependencies_select on public.task_dependencies
  for select to authenticated using (private.is_org_member(organization_id));
create policy task_templates_select on public.task_templates
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));

-- dispatch decisions contain fairness inputs: managers only.
create policy dispatch_rounds_select on public.dispatch_rounds
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));

-- offers, assignments: own rows (while still a member), or managers.
create policy task_offers_select on public.task_offers
  for select to authenticated using (
    (user_id = (select auth.uid()) and private.is_org_member(organization_id))
    or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));
create policy task_assignments_select on public.task_assignments
  for select to authenticated using (
    (user_id = (select auth.uid()) and private.is_org_member(organization_id))
    or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));

-- attendance, availability, breaks: read own or manager. No client writes (cannot forge status).
create policy attendance_select on public.attendance_records
  for select to authenticated using (
    (user_id = (select auth.uid()) and private.is_org_member(organization_id))
    or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));
create policy availability_select on public.availability_records
  for select to authenticated using (
    (user_id = (select auth.uid()) and private.is_org_member(organization_id))
    or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));
create policy breaks_select on public.break_records
  for select to authenticated using (
    (user_id = (select auth.uid()) and private.is_org_member(organization_id))
    or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));
create policy attendance_sync_runs_select on public.attendance_sync_runs
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));
create policy provider_member_mappings_select on public.provider_member_mappings
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN']));
create policy workload_snapshots_select on public.workload_snapshots
  for select to authenticated using (
    (user_id = (select auth.uid()) and private.is_org_member(organization_id))
    or private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));

-- notification devices: strictly own rows.
create policy notification_devices_select_own on public.notification_devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_devices_insert_own on public.notification_devices
  for insert to authenticated with check (
    user_id = (select auth.uid()) and (organization_id is null or private.is_org_member(organization_id)));
create policy notification_devices_update_own on public.notification_devices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_devices_delete_own on public.notification_devices
  for delete to authenticated using (user_id = (select auth.uid()));

-- in-app notifications: own rows; clients may only flip read_at.
create policy in_app_notifications_select_own on public.in_app_notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy in_app_notifications_update_own on public.in_app_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- integrations, documents, audit: restricted roles.
create policy integrations_select on public.integrations
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN']));
revoke select on public.integrations from authenticated;
grant select (id, organization_id, provider, external_tenant_id, status, granted_scopes, last_error, created_at, updated_at)
  on public.integrations to authenticated;
create policy documents_select on public.documents
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN', 'MANAGER']));
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN']));
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (private.has_org_role(organization_id, array['OWNER', 'ADMIN']));

-- Intentionally no client policies: notification_jobs, notification_logs, webhook_events,
-- outbox_events, ai_usage_logs. These are backend/worker-only.

-- Deny every client write by default, then re-grant only what policies are designed for.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant insert, update, delete on public.notification_devices to authenticated;
grant update (display_name, avatar_url, notification_preferences) on public.profiles to authenticated;
grant update (read_at) on public.in_app_notifications to authenticated;
