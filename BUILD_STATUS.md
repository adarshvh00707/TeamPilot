# Build status

_Last updated: 2026-10-11, end of Phase 1._

## Existing architecture (before this work)

The repository was empty. Everything below was created from scratch.

## Current architecture

npm-workspaces monorepo: Expo SDK 57 mobile app, Express 5 API, BullMQ worker, shared TypeScript package, Supabase migrations. The API is the only writer of operational data; it connects to Postgres directly (transactions, row locks) and enforces authorization in services. RLS protects any direct client access. Details: [docs/architecture.md](docs/architecture.md).

## Verification run at the end of Phase 1

| Check | Result |
| --- | --- |
| `npm run typecheck` (shared, api, worker, mobile) | pass |
| `npm test`: 54 tests (shared 9, worker 3, api 42 = 6 unit + 19 API integration + 17 migrations/RLS/constraints) | pass |
| `npm run build` (API + worker bundles) | pass |
| Built API smoke test (`/health` 200, `/ready` 503 without DB, `/api/v1/me` 401) | pass |
| `npx expo export --platform android` (Metro bundles the app incl. shared package) | pass |
| `npx expo-doctor` | 21/21 pass |
| Docker image builds | **not run locally** (Docker unavailable); configured in CI |
| Migrations + seed against hosted Supabase dev project (`supabase db push`) | pass |
| API against hosted DB over verified TLS (`DATABASE_SSL_CA_FILE` = Supabase root CA) | pass (`/ready` 200) |
| Hosted E2E smoke: Supabase password sign-in → API `/me`, members, locations; staff invite 403; PostgREST RLS hides `token_hash` | pass |
| Auth redirect config pushed (`supabase config push`) | pass |
| Android bundle served over LAN by Metro | pass |
| App on a physical device / simulator | **pending user check in Expo Go** |

## Feature status

### Phase 1: Foundation (complete, apart from the items marked as not done)

- [x] Monorepo, root scripts, strict TypeScript, `.gitignore`, `.env.example` files
- [x] Shared package: roles and hierarchy, all domain status enums, central state machines (task, offer, assignment, event), Zod request schemas, API types
- [x] Full database schema for all planned tables, with constraints and indexes (see [docs/database-schema.md](docs/database-schema.md))
- [x] RLS on every table, private helper functions, column-level grants, private storage bucket policy
- [x] Profile auto-creation trigger; development seed (Atrium/L70 scenario org, 7 users)
- [x] API: config validation, JWT verification (JWKS or HS256), request IDs, helmet, CORS, rate limit, structured logging with redaction, centralized errors, graceful shutdown, `/health`, `/ready`, OpenAPI 3.1 at `/api/v1/openapi.json`
- [x] API endpoints: `GET/PATCH /me`; organizations (create/list/get/update); members (list/get/change role or status); invitations (create/list/revoke/accept); locations (list/get/create/update/archive); cursor pagination; audit logging
- [x] Role rules: no self-modification, owner-only owner grants, hierarchy, last-owner protection; invitation tokens hashed, single-use, email-bound
- [x] Worker: config validation, queue registry, deterministic job IDs, backoff with jitter, heartbeat scheduler, health endpoint, graceful drain
- [x] Mobile: Expo Router with auth-guarded groups, sign up / sign in / email verification / password recovery / invitation deep link, Keychain-backed session storage, organization onboarding and switcher, role-aware tabs, profile editing, team management (roles, suspend, invitations), locations, light and dark themes, design system (text, button, field, card, badge, empty/error/skeleton states, unavailable notices)
- [x] CI workflow (typecheck, test, build, expo-doctor, audit, Docker builds), Dockerfile, compose
- [ ] Google / Microsoft sign-in (deferred; the UI says so)
- [ ] Offline banner (needs `@react-native-community/netinfo`); network failures currently surface as error states with retry

### Phase 2: Events and tasks (complete)

- [x] Events API: list (time window, status, cursor), create, get with tasks, edit, status transitions via `eventStateMachine`; publishing stamps `published_at`; cancelling cascades to open tasks and their live assignments in one transaction
- [x] Tasks API: list (event, status, cursor), create, get with assignments and event, edit with optional `expectedVersion` (409 on stale writes), manual transitions limited to `MANUAL_TASK_TARGETS`; staffing states (`PARTIALLY_STAFFED` / `FULLY_STAFFED`) are derived from assignments, never set by hand
- [x] State machine: `SCHEDULED <-> PARTIALLY_STAFFED / FULLY_STAFFED` added so managers can staff without a dispatch round
- [x] Manager assignment with the task row locked; assigning past `required_headcount` requires an override reason, stored as `MANAGER_OVERRIDE` and audited as `task.assigned_override`
- [x] Assignee actions: accept, decline, start (moves a staffed task to `IN_PROGRESS`), complete; manager cancel; staff cannot see or act on other people's assignments
- [x] Drafts (events and tasks) hidden from staff; tasks cannot be scheduled under a draft event
- [x] Personal schedule endpoint, ordered by event start, dispatch start, deadline, then assignment time
- [x] Mobile: Schedule tab (day-grouped agenda with accept/decline/start/complete), Tasks tab (status filters, staffing counts), event list/create/detail with status controls, task create/detail with status controls, assignment, override reason, and removal; Events entry in Operations
- [x] Auth gate waits for session and memberships before rendering any signed-in screen (fixes cold deep links landing on a blank onboarding screen)
- [x] Tests: 16 API integration tests for events, tasks, assignments, and staffing; state-machine test for direct staffing. Verified end to end on the hosted dev project (manager creates/publishes event, creates/schedules task, assigns two staff; staff see it in their schedule, accept, and start)
- [ ] Date/time entry is a text field (`YYYY-MM-DD HH:mm`, device time zone); a native date picker is a follow-up
- [ ] Task templates and dependencies (tables exist) are not exposed yet

### Phase 3: Dispatch engine (complete)

- [x] `AttendanceProvider` interface with a manual provider; manual clock-ins are stored and shown as `MANUAL` ("Unverified (manual)"), never as verified
- [x] Availability derived from attendance, breaks, and pause records (`deriveAvailability`); clock in/out, pause/resume offers, timed breaks; live roster for managers
- [x] Pure, seeded planner (`planWave` in `@teampilot/shared`): eligibility with explicit reasons (role, already assigned/offered, pending offer, not available, missing skill, schedule conflict), workload score, FNV-1a tie-break; per-task `dispatch_policy` (include managers, over-offer factor, max offers per wave, max waves)
- [x] Waves: each round stores seed, policy, ranking, and ineligibility counts for explainability; offers expire after the task's response window
- [x] Atomic acceptance: task row locked before the offer, capacity checked against committed state, losing offers withdrawn with `CAPACITY_FILLED`; refusals (expired, filled) are committed before the error is returned
- [x] Declines advance dispatch immediately; the worker sweeps settled rounds every 10s (`DISPATCH_SWEEP_MS`) and sends the next wave or escalates to `NEEDS_MANAGER_ATTENTION` (`NO_ELIGIBLE_CANDIDATES`, `MAX_WAVES_REACHED`) unless the minimum headcount is met
- [x] Cancelling or rescheduling a task withdraws open offers and cancels running rounds
- [x] Mobile: availability card and live offers with countdown on Home, dispatch panel with rounds and offers on task detail, live roster in Operations
- [x] Tests: 18 shared (planner, state machines), 9 dispatch API tests (escalation, availability, concurrent accept, decline, expiry via sweep, paused exclusion)
- [x] Verified on the hosted project with Upstash Redis: 4 concurrent accepts on a 1-person task produced exactly one winner and three `CAPACITY_FILLED` withdrawals

### Phase 4: Notifications (complete; physical-device check pending)

- [x] Expo project `@sma267/teampilot-ai` linked; devices register Expo push tokens (`POST /me/devices`) and revoke on sign-out
- [x] Transactional outbox: offer, manual-assignment, and escalation events write an in-app notification and a push job in the same transaction, with idempotency keys
- [x] Worker sends due jobs every 5s via the Expo push API (claimed with `SKIP LOCKED`, stuck jobs recovered), retries transport/rate-limit errors with exponential backoff (5 attempts), marks `DeviceNotRegistered` tokens invalid, cancels offer pushes once the offer is no longer open, and confirms delivery from Expo receipts every 15 minutes
- [x] Per-type push opt-out via `notificationPreferences` (in-app is always kept)
- [x] Mobile: in-app inbox with unread state and mark read, push preference switches, tapping a push opens the related screen
- [x] "Starting soon" reminders `REMINDER_LEAD_MINUTES` (default 30) before the event/task start, swept every minute; keyed on the start time so a rescheduled task gets a fresh reminder, and dropped at send time if the assignment was cancelled
- [x] Schedule-change notices to live assignees when a task's start, deadline, location, event, or instructions change, or a published event's time or location changes (the editor is not notified)
- [x] Cancellation notices to everyone removed when a task or its event is cancelled
- [x] Tests: 13 notification tests with a fake push sender; verified on hosted Postgres (worker claimed and settled real jobs; reminder sweep runs clean)
- [ ] End-to-end push on a physical device (iOS Expo Go works; Android needs a development build because Expo Go on Android no longer supports remote push)

### Phases 5–7: Not started
AI task creation and import, assistant, Sling and Teams integrations, email (Resend), release hardening, billing.

## Blockers

None for continuing development. The following are needed to validate against real infrastructure:

1. Docker Desktop and the Supabase CLI locally (or a hosted Supabase dev project), so migrations can be applied to real Supabase and the app can run end to end.
2. Expo account and EAS project (`eas init`) for development builds.

## Required credentials (by phase)

| When | Credential |
| --- | --- |
| Now (run the app) | Supabase project URL, publishable key, DB connection string, JWT secret or JWKS |
| Phase 3 | Redis URL (managed Redis in staging/prod) |
| Phase 4 | Expo project (done); Expo access token only if enhanced push security is enabled; APNs key and FCM v1 service account for standalone builds |
| Phase 5 | LLM provider API key |
| Phase 6 | Sling API access (must be verified as officially available first); Microsoft Entra app registration and tenant consent; Resend API key |
| Billing (future) | Stripe keys and webhook secret |

## Known limitations

- PGlite tests run single-connection Postgres, so true multi-connection race tests (needed for Phase 3 concurrent acceptance) must run against a real Postgres. A CI service container is planned with Phase 3.
- Invitation delivery is by share link only until Resend is integrated (Phase 6). The token is shown once.
- `npm audit` reports advisories in dev and transitive tooling dependencies; it is not yet a blocking CI gate.

## Next milestones

1. Add a Postgres service container to CI for multi-connection concurrency tests.
2. Verify push on a physical device.
3. **Phase 5**: AI features (needs an LLM provider API key).
