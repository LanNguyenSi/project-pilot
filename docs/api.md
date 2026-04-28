# API

The backend exposes a Hono HTTP API at `:3001/api/*`. All inputs are validated with Zod via `@hono/zod-validator`; invalid payloads return `400` before any handler logic runs.

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

- `GET /api/dashboard/summary` aggregated stats from all three services

## Forge proxy (project-forge)

- `GET  /api/forge/projects` list created projects
- `POST /api/forge/generate` generate preview
- `GET  /api/forge/preview?sessionId=` get preview data
- `POST /api/forge/publish` publish to GitHub

## Tasks proxy (agent-tasks)

- `GET  /api/tasks/projects` list projects
- `GET  /api/tasks/projects/:id/tasks` list tasks
- `GET  /api/tasks/claimable` open tasks
- `GET  /api/tasks/:id` task details
- `GET  /api/tasks/:id/instructions` agent instructions
- `POST /api/tasks/:id/transition` change status
- `POST /api/tasks/:id/comments` add comment
- `GET  /api/tasks/signals/inbox` agent signals

## Deploy proxy (deploy-panel)

- `GET  /api/deploy/servers` list servers
- `GET  /api/deploy/apps` list apps
- `POST /api/deploy/trigger` deploy app
- `GET  /api/deploy/status/:id` deploy status
- `GET  /api/deploy/history` deploy history (filterable by server, app, status, date range)
- `POST /api/deploy/rollback` rollback
- `POST /api/deploy/preflight` preflight checks
- `GET  /api/deploy/logs` app logs

## Health

- `GET /api/health` health check with DB status

## Validation surface

All `POST` / `PUT` bodies and query params with non-trivial shape go through Zod schemas defined alongside the route handlers in `backend/src/routes/`. Pagination and search params on `tasks`, `deploys`, and `projects` are similarly validated.
