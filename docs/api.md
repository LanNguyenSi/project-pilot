# API

The backend exposes a Hono HTTP API at `:3001/api/*`. All `POST`/`PUT` JSON bodies are validated with Zod via `@hono/zod-validator`; invalid bodies return `400` before any handler logic runs (see the [validation surface](#validation-surface) section).

## Authentication and request rules

- Session: register, login and GitHub sign-in set an httpOnly `session` cookie that lasts 30 days and is `Secure` when `NODE_ENV=production`. It is `SameSite=Strict` after register or password login and `SameSite=Lax` after GitHub sign-in. Every route except `GET /api/health`, `/api/oauth/*` and the auth endpoints `register`, `login`, `logout`, `forgot-password` and `reset-password` returns `401` without a valid session.
- CSRF: `POST`, `PUT`, `PATCH` and `DELETE` requests under `/api/auth`, `/api/credentials`, `/api/dashboard`, `/api/forge`, `/api/tasks` and `/api/deploy` must send `X-Requested-With: XMLHttpRequest`, or they get `403` with `csrf_failed`.
- Rate limits: per minute, per client IP and path: `register` 5, `login` 10, `forgot-password` 3, `reset-password` 5. `login` and `forgot-password` are also limited per submitted email. A breach returns `429` with `Retry-After`. The client IP is the last `X-Forwarded-For` entry (the socket address when the header is absent), so deploy behind exactly one reverse proxy. Counters are kept in memory per backend process.
- CORS: only origins listed in `CORS_ORIGINS`, with credentials.

## Auth

- `POST /api/auth/register` create account
- `POST /api/auth/login` sign in
- `POST /api/auth/logout` sign out
- `GET  /api/auth/me` current user
- `POST /api/auth/forgot-password` request password reset
- `POST /api/auth/reset-password` reset password with token

## OAuth

- `GET /api/oauth/github/start` begin GitHub OAuth flow (redirects to GitHub)
- `GET /api/oauth/github/callback` GitHub OAuth callback: checks the state cookie, exchanges the code, creates or links the user, registers the user with each downstream service, sets the session cookie and redirects to `/dashboard`. See [GitHub sign-in](configuration.md#github-sign-in).

Both routes return `503` unless `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in the backend env (see [configuration.md](configuration.md)).

## Service credentials

- `GET    /api/credentials` list configured services
- `PUT    /api/credentials` add/update service token
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

- `GET /api/health` health check with DB status

## Validation surface

All `POST` / `PUT` JSON bodies go through Zod schemas defined alongside the route handlers in `backend/src/routes/`, via `@hono/zod-validator`. Query params are not Zod-validated: deploy history's `limit`/`offset`/filters are parsed manually with ad-hoc clamping, `deploy/apps?server_id` and `deploy/logs`'s `server`/`app`/`lines` are read directly with minimal manual checks (`backend/src/routes/deploy.ts`), and `forge/preview?sessionId` is checked by hand against a UUID regex (`backend/src/routes/forge.ts`). Tasks and projects list routes take no query params; pagination and search there are purely client-side in the frontend.
