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
| Migrations against real Supabase / Supabase CLI | **not run** (no Docker / Supabase CLI locally). Tested on PGlite with an auth stub. |
| App on a physical device / simulator | **not run** |

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

### Phase 2: Events and tasks (not started)
Event and task CRUD, publishing and status transitions using the shared state machines, manager assignment, personal schedule, and calendar. The app shows clearly labeled "Not available yet" notices on these tabs.

### Phase 3: Dispatch engine (not started; schema prepared)
Attendance provider interface, manual attendance fallback (marked unverified), availability and eligibility, break management, fair workload scoring, seeded tie-breaking, offers, atomic acceptance with capacity locking, dispatch waves, escalation.

### Phase 4: Notifications (not started; schema prepared)
Expo push registration, durable notification jobs, reminders, rescheduling and cancellation, delivery receipts, in-app notification center.

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
| Phase 4 | Expo access token; APNs key (Apple Developer); FCM v1 service account (Firebase) |
| Phase 5 | LLM provider API key |
| Phase 6 | Sling API access (must be verified as officially available first); Microsoft Entra app registration and tenant consent; Resend API key |
| Billing (future) | Stripe keys and webhook secret |

## Known limitations

- PGlite tests run single-connection Postgres, so true multi-connection race tests (needed for Phase 3 concurrent acceptance) must run against a real Postgres. A CI service container is planned with Phase 3.
- Invitation delivery is by share link only until Resend is integrated (Phase 6). The token is shown once.
- `npm audit` reports advisories in dev and transitive tooling dependencies; it is not yet a blocking CI gate.

## Next milestones

1. **Phase 2**: events and tasks API and screens, status transitions enforced through `taskStateMachine` and `eventStateMachine`, manager assignment with an audited override reason, personal schedule.
2. Add a Postgres service container to CI for multi-connection concurrency tests.
3. **Phase 3**: dispatch engine as a pure, seeded, unit-tested module plus transactional acceptance.
