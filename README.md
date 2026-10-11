# TeamPilot AI

Mobile-first event operations and real-time task dispatch. Managers describe the work; TeamPilot finds eligible, available staff, distributes work fairly, and follows it through completion.

> Status: **Phase 1 (foundation) complete.** See [BUILD_STATUS.md](BUILD_STATUS.md) for exactly what works and what does not.

## Repository

```
apps/mobile      Expo (iOS/Android) app – Expo Router, TanStack Query, RHF + Zod
apps/api         Express 5 REST API (/api/v1), pg, Zod, pino
apps/worker      BullMQ worker (durable jobs)
packages/shared  Domain constants, state machines, Zod schemas, API types
supabase/        SQL migrations, RLS, seed data, local CLI config
infra/           Dockerfile + compose for API/worker/Redis
docs/            Architecture, schema, security, deployment
```

## Prerequisites

- Node.js 20.19+ (22 recommended) and npm 10+
- For a full local stack: Docker Desktop and the Supabase CLI (`npx supabase`)
- For devices: Expo Go is not sufficient once native modules are added; use an EAS development build

## Setup

```sh
npm install
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env.local
```

### Local backend

```sh
npx supabase start            # Postgres, Auth, Storage (requires Docker); applies migrations + seed
npx supabase status           # copy the API URL, publishable key, and JWT secret
# put SUPABASE_URL / SUPABASE_JWT_SECRET into .env, publishable key into apps/mobile/.env.local
docker compose -f infra/compose.yaml up redis -d
npm run dev:api               # http://localhost:4000  (OpenAPI: /api/v1/openapi.json)
npm run dev:worker
```

Seeded users (local only, password `TeamPilot!dev1`): `owner@teampilot.dev`, `manager@teampilot.dev`, `ana|ben|chen|dana|eli@teampilot.dev`.

### Mobile

```sh
npm run dev:mobile            # then press i / a, or scan with a dev build
```

Use your machine's LAN IP for `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL` when running on a physical device or Android emulator.

## Checks

```sh
npm run typecheck   # all workspaces including mobile
npm test            # unit + API integration + migrations/RLS (PGlite, no Docker needed)
npm run build       # API and worker bundles
cd apps/mobile && npx expo-doctor
```

## Notes on the monorepo

The root `devDependencies` pin `react`, `react-dom`, `react-native-reanimated`, and `react-native-worklets` to the Expo SDK 57 versions. npm otherwise hoists newer peer copies, which produces duplicate native modules. When upgrading Expo, run `npx expo install --fix` in `apps/mobile` and update these pins to match.
