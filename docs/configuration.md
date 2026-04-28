# Configuration

Credential storage, env vars, password reset.

## Credential storage

Service credentials (Forge API key, Tasks token, Deploy API key) are stored encrypted in PostgreSQL via the backend, scoped to the logged-in user. The Settings page (`/settings`) exposes **Test Connection** validation against each downstream service before saving.

The MCP server is a separate process and reads credentials from environment variables, not from the encrypted store.

## Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes |  | PostgreSQL connection string |
| `SESSION_SECRET` | yes |  | Session signing key (min 16 chars) |
| `PORT` | no | 3001 | Backend port |
| `CORS_ORIGINS` | no | http://localhost:3000 | Allowed origins |
| `FRONTEND_URL` | no | http://localhost:3000 | Frontend URL |
| `NODE_ENV` | no | development | development, production, test |
| `PROJECT_FORGE_URL` | no | https://project-forge.opentriologue.ai | Forge API base URL |
| `AGENT_TASKS_URL` | no | https://agent-tasks.opentriologue.ai | Tasks API base URL |
| `DEPLOY_PANEL_URL` | no | https://deploy-panel.opentriologue.ai | Deploy API base URL |
| `BACKEND_URL` | no | http://localhost:3001 | Public backend URL, used to build the OAuth redirect URI |
| `GITHUB_CLIENT_ID` | no |  | GitHub OAuth app client ID. When unset (along with `GITHUB_CLIENT_SECRET`), the `/api/oauth/github/*` routes return 503 |
| `GITHUB_CLIENT_SECRET` | no |  | GitHub OAuth app client secret. When unset (along with `GITHUB_CLIENT_ID`), the `/api/oauth/github/*` routes return 503 |

## Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | http://localhost:3001 | Backend URL for browser requests |
| `NEXT_PUBLIC_DEPSIGHT_URL` | https://depsight.opentriologue.ai | Depsight URL used by the Security page (`/security`) |

## MCP server

| Variable | Required | Description |
|----------|----------|-------------|
| `FORGE_API_KEY` | yes | project-forge API key (`pf_...`) |
| `TASKS_TOKEN` | yes | agent-tasks Bearer token |
| `DEPLOY_API_KEY` | yes | deploy-panel API key (`dp_...`) |
| `FORGE_URL` | no | Override Forge API URL |
| `TASKS_URL` | no | Override Tasks API URL |
| `DEPLOY_URL` | no | Override Deploy API URL |

## Password reset

The auth surface ships a forgot-password / reset-with-token flow via:

- `POST /api/auth/forgot-password` issues a reset token.
- `POST /api/auth/reset-password` consumes the token to set a new password.

Email delivery for the reset link is on the roadmap, not yet wired. In the meantime the token is returned for operator-driven recovery.

## Security headers

In production (`NODE_ENV=production`) the backend emits CSP and HSTS headers on every response.

## Docker deployment

### Development

```bash
docker compose up
```

### Production (with Traefik)

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Exposes via Traefik at `project-pilot.opentriologue.ai` with automatic HTTPS.
