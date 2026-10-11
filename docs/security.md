# Security

## Authentication

- Supabase Auth (email/password with confirmation and recovery). Google/Microsoft sign-in is not enabled yet.
- Mobile sessions are stored only in the OS Keychain/Keystore via `expo-secure-store` (chunked to fit platform limits). Nothing auth-related goes into AsyncStorage.
- The API verifies access tokens against the project JWKS (or legacy HS256 secret), checks `aud=authenticated` and issuer, and rejects `anon` tokens.

## Authorization

- Every org-scoped route runs `requireOrgRole(minRole)`, which loads the caller's **active** membership from the database. Suspended/removed members lose access immediately.
- Role management rules (`apps/api/src/services/members.ts`): no self-modification; only OWNER grants OWNER; others must outrank the target and cannot grant above their own role; the last active OWNER cannot be demoted or suspended (owner rows are locked during the check).
- Invitations: random 256-bit tokens, only SHA-256 hashes stored, single use, expiring, bound to the invited email, uniform error for invalid/expired tokens.

## Row Level Security

RLS is enabled on every public table. Clients get read access only where a policy allows it, and **no client write access** except:

- `notification_devices`: insert/update/delete own rows only.
- `profiles`: update own `display_name`, `avatar_url`, `notification_preferences` only.
- `in_app_notifications`: update own `read_at` only.

Sensitive columns are excluded via column-level grants (`invitations.token_hash`, `integrations.credential_reference`). Backend-only tables (`notification_jobs`, `notification_logs`, `webhook_events`, `outbox_events`, `ai_usage_logs`) have no client policies. All of this is covered by `apps/api/tests/db/rls.test.ts`.

## Transport and API hardening

Helmet security headers, CORS allow-list (native apps send no Origin), JSON body limit 256 KB, per-IP rate limiting, request IDs, centralized error handling that never returns stack traces, and pino log redaction of authorization headers, cookies, passwords, and tokens.

## Secrets

- Service-role keys, database URLs, and provider secrets live only in backend environment variables. The mobile app receives only the Supabase URL, the publishable key, and the API URL.
- Integration credentials will be stored in a secret manager or encrypted at rest; tables keep only a `credential_reference`.

## Known gaps (tracked in BUILD_STATUS.md)

Data retention/deletion workflows, webhook signature verification, OAuth state handling, and dependency auditing in CI as a blocking gate are not implemented yet.
