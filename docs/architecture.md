# Architecture

## Components

| Component | Tech | Responsibility |
| --- | --- | --- |
| `apps/mobile` | Expo SDK 57, Expo Router, TanStack Query, React Hook Form, Zod | Primary product for staff and managers (iOS/Android). |
| `apps/api` | Node 20+, Express 5, `pg`, Zod, pino | REST API under `/api/v1`. Single authority for writes and business rules. |
| `apps/worker` | BullMQ + Redis | Durable scheduled/background jobs (dispatch waves, offer expiry, reminders, push, sync). |
| `packages/shared` | TypeScript + Zod | Domain constants, state machines, request schemas, API types shared by all apps. |
| `supabase/` | Postgres, Auth, Storage | Authoritative database, identity, private file storage. |

## Request flow

1. The mobile app authenticates with Supabase Auth and keeps the session in the device Keychain/Keystore (chunked `expo-secure-store` adapter).
2. API calls send the Supabase access token as `Authorization: Bearer`.
3. The API verifies the JWT (project JWKS, or the legacy HS256 secret when configured), then resolves the caller's **active membership** for `:organizationId` from the database. Non-members get `404` so organization existence is not disclosed; insufficient roles get `403`.
4. Services execute business rules inside database transactions (row locks where races matter) and write an `audit_logs` entry for consequential changes.

## Why the API talks to Postgres directly

The API uses a direct `pg` connection rather than PostgREST so that dispatch, acceptance, and staffing logic can use real transactions, `SELECT ... FOR UPDATE`, and partial unique indexes. That connection role bypasses RLS, so **every service enforces authorization explicitly** (`requireOrgRole` middleware plus per-operation rules such as role hierarchy and last-owner protection). RLS remains the boundary for any direct client access through Supabase and is tested separately.

## Clients never decide

Clients never supply trusted organization IDs, roles, attendance status, or eligibility. Navigation visibility in the app is a convenience only; the API re-checks everything.

## State machines

Task, offer, assignment, and event transitions are defined once in `packages/shared/src/state-machines.ts` and must be asserted by backend services before any status change.

## Background work

Business-critical timing (dispatch waves, offer expiry, reminders, escalations) runs in the worker from durable Redis-backed jobs with deterministic job IDs (idempotent enqueue). Processors must reread authoritative database state before acting. Phone-local timers are never used for organization-wide behaviour.

## Testing strategy

- **Unit tests**: pure logic (state machines, schemas, role rules, backoff).
- **API integration tests**: the real Express app against the real SQL migrations running in PGlite (Postgres compiled to WASM) with a small Supabase `auth` stub (`apps/api/tests/helpers/supabase-stub.sql`).
- **RLS tests**: run queries as the `authenticated` role with JWT claims set, exactly as PostgREST does.
- Live-provider tests (Supabase cloud, Expo push, Sling, Teams) are separate and require credentials; none are claimed yet.
