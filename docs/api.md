# API

The backend exposes a Hono HTTP API at `:3001/api/*`. All `POST`/`PUT` JSON bodies are validated with Zod via `@hono/zod-validator`; invalid bodies return `400` before any handler logic runs (see the [validation surface](#validation-surface) section).

## Auth

- `POST /api/auth/register` create account
- `POST /api/auth/login` sign in
- `POST /api/auth/logout` sign out
- `GET  /api/auth/me` current user
- `POST /api/auth/forgot-password` request password reset
- `POST /api/auth/reset-password` reset password with token

## OAuth

- `GET /api/oauth/github/start` begin GitHub OAuth flow (redirects to GitHub)
- `GET /api/oauth/github/callback` GitHub OAuth callback (exchanges code for token)

Both routes return `503` unless `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in the backend env (see [configuration.md](configuration.md)).

## Service credentials

- `GET    /api/credentials` list configured services
- `PUT    /api/credentials` add/update service token
- `DELETE /api/credentials/:service` remove token
- `POST   /api/credentials/validate` test connection to a service

## Dashboard

- `GET /api/dashboard/summary` aggregated service stats

Project and open-task counts come from agent-tasks; server, online-server, and app counts come from deploy-panel. project-forge contributes only a `configured` flag (no live count or health check).

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
