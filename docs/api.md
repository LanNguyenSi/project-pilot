# API

The backend exposes a Hono HTTP API at `:3001/api/*`. All `POST`/`PUT` JSON bodies are validated with Zod via `@hono/zod-validator`; invalid bodies return `400` before any handler logic runs (see the [validation surface](#validation-surface) section).

## Authentication and request rules

- Session: register, login and GitHub sign-in set an httpOnly `session` cookie that lasts 30 days and is `Secure` when `NODE_ENV=production`. It is `SameSite=Strict` after register or password login and `SameSite=Lax` after GitHub sign-in. Every route except `GET /api/health`, `/api/oauth/*` and the auth endpoints `register`, `login`, `logout`, `forgot-password` and `reset-password` returns `401` without a valid session.
- CSRF: `POST`, `PUT`, `PATCH` and `DELETE` requests under `/api/auth`, `/api/credentials`, `/api/dashboard`, `/api/forge`, `/api/tasks` and `/api/deploy` must send `X-Requested-With: XMLHttpRequest`, or they get `403` with `csrf_failed`.
- Rate limits: per minute, per client IP and path: `register` 5, `login` 10, `forgot-password` 3, `reset-password` 5, `PUT /api/credentials` 10, `POST /api/forge/ai-assist/magic-fill` 10, and the expensive proxies `POST /api/deploy/install-relay` 3, `POST /api/deploy/probe-vps` 5, `POST /api/tasks/teams/:teamId/sync` 3, `POST /api/forge/generate` 5, `POST /api/forge/publish` 5. `login` and `forgot-password` are also limited per submitted email, `PUT /api/credentials`, `POST /api/forge/ai-assist/magic-fill` and the five expensive proxies per signed-in user. The expensive-proxy limits are lower than 10 because one call holds a long upstream operation (an SSH probe up to 45 s, a relay install up to ~10 min, a team sync up to 120 s, generate and publish up to 60 s each, and generate and publish also spend the operator's AI and GitHub quota on project-forge); the numbers are named constants in the route files, not env. A breach returns `429` with `Retry-After`. The client IP is the last `X-Forwarded-For` entry (the socket address when the header is absent), so deploy behind exactly one reverse proxy. Counters are kept in memory per backend process. Bucket keys carry the request path, except `POST /api/tasks/teams/:teamId/sync`, which pins both keys to the fixed bucket name `tasks:team-sync`: its 3 per minute are per user and per IP across all team ids and path variants, not per team id.
- CORS: only origins listed in `CORS_ORIGINS`, with credentials.
- Body size: every request body above 128 KiB (131072 bytes, `MAX_BODY_BYTES` in `backend/src/middleware/body-limit.ts`) gets `413` with the JSON body `{"error":"Payload too large"}`. The limit is registered on `*` before routing, so it is checked before CSRF and before the rate-limit key generators, and it counts the stream when `Content-Length` is absent (chunked bodies), so a missing or lying header does not bypass it.

## Auth

- `POST /api/auth/register` create the first account, bootstrap only: answers `403 registration_closed` (same body in every refusal, no account created, no hint whether the email exists) unless `ALLOW_FIRST_PASSWORD_ACCOUNT=true` and the user table is empty, see [Password registration](configuration.md#password-registration)
- `POST /api/auth/login` sign in
- `POST /api/auth/logout` sign out
- `GET  /api/auth/me` current user
- `GET  /api/auth/sessions` signed-in users only: `{"active": n, "current": true}`, the number of unexpired sessions of the account (password and GitHub sign-ins both create a session row)
- `POST /api/auth/sessions/revoke-others` signed-in users only: deletes every other session of the account and keeps the one that sent the request, answers `{"ok": true, "revoked": n}` where `n` is the number of unexpired sessions ended (expired rows of the account are removed too but not counted). Downstream service tokens (Credentials) are not touched.
- `POST /api/auth/forgot-password` request password reset; the lookup and token issuance run after the response is sent, so the request does no database work for either a known or an unknown email.
- `POST /api/auth/reset-password` reset password with token

## OAuth

- `GET /api/oauth/config` public, unauthenticated: `{"github": boolean}`, whether GitHub OAuth is configured (both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` set). The login page shows its GitHub button only on `true`.
- `GET /api/oauth/github/start` begin GitHub OAuth flow (redirects to GitHub)
- `GET /api/oauth/github/callback` GitHub OAuth callback: checks the state cookie, exchanges the code, creates or links the user, registers the user with each downstream service, sets the session cookie and redirects to `/dashboard`. See [GitHub sign-in](configuration.md#github-sign-in).

Without `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the backend env (see [configuration.md](configuration.md)), `start` redirects to the frontend's `/auth/error?reason=not_configured` page and `callback` returns `503`.

## Service credentials

- `GET    /api/credentials` list configured services
- `PUT    /api/credentials` add/update service token (`token` 1 to 4096 characters, optional `label` up to 200; longer values get `400`)
- `DELETE /api/credentials/:service` remove token
- `POST   /api/credentials/validate` test connection to a service

## Dashboard

- `GET /api/dashboard/summary` aggregated service stats

Project and claimable-task counts come from agent-tasks; server, online-server, and app counts come from deploy-panel. project-forge contributes only a `configured` flag (no live count or health check). A service whose stored credential cannot be decrypted (e.g. after a `SESSION_SECRET` change) reports the optional `unreadable: true` field (with `configured` still `true`), its count fields are `null`, and its downstream calls are skipped; the request itself stays 200.

## Forge proxy (project-forge)

- `GET    /api/forge/projects` list created projects
- `DELETE /api/forge/projects/:id` delete a created project
- `POST   /api/forge/generate` generate preview
- `GET    /api/forge/preview?sessionId=` get preview data
- `POST   /api/forge/publish` publish to GitHub
- `POST   /api/forge/migrate-tasks` migrate a generated project's tasks into an agent-tasks team
- `GET    /api/forge/ai-assist/capabilities` AI magic-fill availability (provider, model, features)
- `POST   /api/forge/ai-assist/magic-fill` AI-assisted project form fill from a prompt

## Tasks proxy (agent-tasks)

- `GET  /api/tasks/projects` list projects
- `POST /api/tasks/projects` create a project in a team
- `GET  /api/tasks/projects/:id/tasks` list tasks
- `POST /api/tasks/projects/:projectId/tasks` create a task in a project
- `GET  /api/tasks/teams` list teams
- `POST /api/tasks/teams/:teamId/sync` sync the user's GitHub repos into a team
- `GET  /api/tasks/:id` task details
- `GET  /api/tasks/:id/instructions` agent instructions
- `POST /api/tasks/:id/comments` add comment
- `GET  /api/tasks/signals/inbox` agent signals

## Deploy proxy (deploy-panel)

- `GET    /api/deploy/servers` list servers
- `POST   /api/deploy/servers` add a server
- `DELETE /api/deploy/servers/:id` remove a server
- `POST   /api/deploy/servers/:id/test` relay connectivity check for a server
- `GET    /api/deploy/apps` list apps
- `POST   /api/deploy/trigger` deploy app
- `GET    /api/deploy/status/:id` deploy status
- `GET    /api/deploy/history` deploy history (filterable by server, app, status)
- `POST   /api/deploy/rollback` rollback
- `POST   /api/deploy/preflight` preflight checks
- `GET    /api/deploy/logs` app logs
- `POST   /api/deploy/probe-vps` pre-install probe (SSH reachability, host-key fingerprint)
- `POST   /api/deploy/install-relay` stream SSE relay-install progress

## Health

- `GET /api/health` health check with DB status: `200 {"status":"ok","db":"connected"}` after `SELECT 1` and a read of the `User` table, `503 {"status":"degraded","db":"disconnected"}` when the database does not answer, `503 {"status":"degraded","db":"schema_missing"}` when it answers but the table is not there (no schema applied). The Docker healthcheck, the relay health gate and `make deploy` poll this route, so an unapplied schema is not a green deploy.

## Validation surface

All `POST` / `PUT` JSON bodies go through Zod schemas defined alongside the route handlers in `backend/src/routes/`, via `@hono/zod-validator`. Query params are not Zod-validated: deploy history's `limit`/`offset`/filters are parsed manually with ad-hoc clamping, `deploy/apps?server_id` and `deploy/logs`'s `server`/`app`/`lines` are read directly with minimal manual checks (`backend/src/routes/deploy.ts`), and `forge/preview?sessionId` is checked by hand against a UUID regex (`backend/src/routes/forge.ts`). Tasks and projects list routes take no query params; pagination and search there are purely client-side in the frontend.
