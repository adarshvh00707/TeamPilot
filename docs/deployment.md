# Deployment

## Environments

Use one Supabase project per environment (development, staging, production) and separate API/worker deployments and Redis instances. Each environment has its own `.env` (backend) and EAS environment variables (mobile).

## Database

```sh
npx supabase link --project-ref <ref>
npx supabase db push          # applies supabase/migrations
```

Never run `supabase/seed.sql` against staging or production. Enable Point-in-Time Recovery on production and test a restore before launch.

Supabase Auth settings to configure per project: site URL `teampilot://`, redirect URLs `teampilot://verify-email` and `teampilot://reset-password`, email confirmation on, and a custom SMTP provider (Resend) for production volume.

## API and worker

Both build from `infra/docker/node-service.Dockerfile`:

```sh
docker build -f infra/docker/node-service.Dockerfile --build-arg SERVICE=api -t teampilot-api .
docker build -f infra/docker/node-service.Dockerfile --build-arg SERVICE=worker -t teampilot-worker .
```

- API: expose `PORT`, liveness `GET /health`, readiness `GET /ready` (checks the database). Run at least 2 replicas behind a TLS-terminating load balancer; set `TRUST_PROXY=true`.
- Worker: no public port; liveness `GET :4100/health`. Shutdown waits for in-flight jobs (SIGTERM, 30 s grace).
- `DATABASE_URL` should use the Supabase connection pooler in production with `DATABASE_SSL=true`.
- Configuration is validated at startup; the process exits with a readable list of missing/invalid variables.

> The Dockerfile and compose file have not been built locally yet (Docker was unavailable on the development machine). CI builds both images on every push.

## Mobile (EAS)

```sh
cd apps/mobile
npx eas-cli@latest init
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --environment production ...
npx eas-cli@latest build --profile development --platform all   # dev client
npx eas-cli@latest build --profile production --platform all
```

Profiles are in `apps/mobile/eas.json`. iOS requires an Apple Developer account (EAS manages certificates/provisioning). Android requires a Play Console account. Push notifications (Phase 4) will additionally need APNs keys and FCM v1 credentials uploaded to EAS.

## Monitoring

Logs are structured JSON (pino) with request IDs. Error-tracking (e.g. Sentry) and metrics hooks are not wired yet.
