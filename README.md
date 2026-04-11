# project-pilot

Unified control plane for the full project lifecycle: **Create** (project-forge) **Develop** (agent-tasks) **Deploy** (deploy-panel).

One login, one dashboard, one MCP server — aggregating three independent services via their APIs.

### Key Features

- Unified dark-mode dashboard with aggregated stats from all services
- Encrypted service credential storage with **Test Connection** validation
- Pagination and search on tasks, deploys, and projects
- Deploy history filters (by server, app, status, date range)
- Password reset flow (forgot password / reset with token)
- Error boundaries for graceful failure handling
- Zod input validation on all API endpoints
- Security headers (CSP, HSTS) in production

## Architecture

```
project-pilot/
├── backend/     Hono API (port 3001)
├── frontend/    Next.js 15 (port 3000)
└── mcp/         MCP server (stdio)
```

project-pilot does not duplicate business logic. It acts as a proxy layer:

- **Backend** authenticates users, stores encrypted service credentials, and forwards requests to downstream APIs.
- **Frontend** provides a unified dark-mode UI across all services.
- **MCP** exposes 15 tools for AI agent integration.

### Downstream Services

| Service | Purpose | Auth |
|---------|---------|------|
| [project-forge](https://github.com/LanNguyenSi/project-forge) | AI-powered project scaffolding | `X-API-Key` |
| [agent-tasks](https://github.com/LanNguyenSi/agent-tasks) | Task management for human-agent collaboration | `Bearer` token |
| [deploy-panel](https://github.com/LanNguyenSi/deploy-panel) | VPS deployment management | `Bearer` API key |

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS
- **Backend:** Hono 4, TypeScript (strict), Prisma 5, PostgreSQL 16
- **MCP:** @modelcontextprotocol/sdk 1.29
- **Deployment:** Docker, Traefik

## Setup

```bash
# Install dependencies
make install

# Start PostgreSQL
make docker-up

# Generate Prisma client and push schema
make db-generate
make db-push

# Copy and edit environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start development servers
make dev
```

Frontend: http://localhost:3000
Backend: http://localhost:3001

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | yes | — | Session signing key (min 16 chars) |
| `PORT` | no | 3001 | Backend port |
| `CORS_ORIGINS` | no | http://localhost:3000 | Allowed origins |
| `FRONTEND_URL` | no | http://localhost:3000 | Frontend URL |
| `NODE_ENV` | no | development | development, production, test |
| `PROJECT_FORGE_URL` | no | https://project-forge.opentriologue.ai | Forge API base URL |
| `AGENT_TASKS_URL` | no | https://agent-tasks.opentriologue.ai | Tasks API base URL |
| `DEPLOY_PANEL_URL` | no | https://deploy-panel.opentriologue.ai | Deploy API base URL |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | http://localhost:3001 | Backend URL for browser requests |

### MCP Server

| Variable | Required | Description |
|----------|----------|-------------|
| `FORGE_API_KEY` | yes | project-forge API key (`pf_...`) |
| `TASKS_TOKEN` | yes | agent-tasks Bearer token |
| `DEPLOY_API_KEY` | yes | deploy-panel API key (`dp_...`) |
| `FORGE_URL` | no | Override Forge API URL |
| `TASKS_URL` | no | Override Tasks API URL |
| `DEPLOY_URL` | no | Override Deploy API URL |

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in
- `POST /api/auth/logout` — Sign out
- `GET /api/auth/me` — Current user
- `POST /api/auth/forgot-password` — Request password reset email
- `POST /api/auth/reset-password` — Reset password with token

### Service Credentials
- `GET /api/credentials` — List configured services
- `PUT /api/credentials` — Add/update service token
- `DELETE /api/credentials/:service` — Remove token
- `POST /api/credentials/validate` — Test connection to a service

### Dashboard
- `GET /api/dashboard/summary` — Aggregated stats from all services

### Forge (project-forge proxy)
- `GET /api/forge/projects` — List created projects
- `POST /api/forge/generate` — Generate preview
- `GET /api/forge/preview?sessionId=` — Get preview data
- `POST /api/forge/publish` — Publish to GitHub

### Tasks (agent-tasks proxy)
- `GET /api/tasks/projects` — List projects
- `GET /api/tasks/projects/:id/tasks` — List tasks
- `GET /api/tasks/claimable` — Open tasks
- `GET /api/tasks/:id` — Task details
- `GET /api/tasks/:id/instructions` — Agent instructions
- `POST /api/tasks/:id/transition` — Change status
- `POST /api/tasks/:id/comments` — Add comment
- `GET /api/tasks/signals/inbox` — Agent signals

### Deploy (deploy-panel proxy)
- `GET /api/deploy/servers` — List servers
- `GET /api/deploy/apps` — List apps
- `POST /api/deploy/trigger` — Deploy app
- `GET /api/deploy/status/:id` — Deploy status
- `GET /api/deploy/history` — Deploy history
- `POST /api/deploy/rollback` — Rollback
- `POST /api/deploy/preflight` — Preflight checks
- `GET /api/deploy/logs` — App logs

### Health
- `GET /api/health` — Health check with DB status

## MCP Server

The MCP server provides 15 tools for Claude Code and other MCP clients.

### Setup with Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "project-pilot": {
      "command": "npx",
      "args": ["tsx", "/path/to/project-pilot/mcp/src/index.ts"],
      "env": {
        "FORGE_API_KEY": "pf_...",
        "TASKS_TOKEN": "at_...",
        "DEPLOY_API_KEY": "dp_..."
      }
    }
  }
}
```

### Available Tools

**Forge:** `forge_list_projects`, `forge_create_project`, `forge_publish_project`

**Tasks:** `tasks_list_projects`, `tasks_list_tasks`, `tasks_claimable`, `tasks_get_instructions`, `tasks_claim`, `tasks_transition`

**Deploy:** `deploy_list_servers`, `deploy_list_apps`, `deploy_app`, `deploy_status`, `deploy_preflight`, `deploy_rollback`, `deploy_history`

**Aggregation:** `dashboard_summary`

## Docker Deployment

### Development

```bash
docker compose up
```

### Production (with Traefik)

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Exposes via Traefik at `project-pilot.opentriologue.ai` with automatic HTTPS.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Login / Register |
| `/dashboard` | Aggregated overview |
| `/settings` | Service credential management |
| `/forge` | Project list |
| `/forge/create` | Create project wizard |
| `/tasks` | Task board |
| `/deploys` | Server fleet & deploy management |

## Roadmap

- [ ] Email notifications for password reset
- [ ] Request logging (structured access / error logs)
- [ ] User profile management (display name, avatar)
- [ ] Session management (list active sessions, revoke)
