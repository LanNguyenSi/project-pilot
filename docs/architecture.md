# Architecture

project-pilot is the unified control plane that aggregates three independent services into a single dashboard, single login, and single MCP surface.

```
project-pilot/
├── backend/     Hono API (port 3001)
├── frontend/    Next.js 15 (port 3000)
└── mcp/         MCP server (stdio)
```

## Aggregation model

project-pilot does not duplicate business logic. It acts as a thin proxy layer in front of three independent services:

- **Backend** authenticates users, stores encrypted service credentials, and forwards requests to downstream APIs.
- **Frontend** provides a unified dark-mode UI across all services.
- **MCP** exposes 18 tools for AI agent integration over stdio.

```
                  ┌──────────────────────┐
                  │    project-pilot     │
                  │  (one login, one UI) │
                  └──────────┬───────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │  Create   │        │  Develop  │        │  Deploy   │
  │project-   │        │  agent-   │        │  deploy-  │
  │  forge    │        │   tasks   │        │   panel   │
  └───────────┘        └───────────┘        └───────────┘
   X-API-Key            Bearer token         Bearer key
```

## Downstream services

| Service | Purpose | Auth |
|---------|---------|------|
| [project-forge](https://github.com/LanNguyenSi/project-forge) | AI-powered project scaffolding | `X-API-Key` |
| [agent-tasks](https://github.com/LanNguyenSi/agent-tasks) | Task management for human-agent collaboration | `Bearer` token |
| [deploy-panel](https://github.com/LanNguyenSi/deploy-panel) | VPS deployment management | `Bearer` API key |

## Tech stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS
- **Backend:** Hono 4, TypeScript (strict), Prisma 5, PostgreSQL 16
- **MCP:** @modelcontextprotocol/sdk 1.29
- **Deployment:** Docker, Traefik

## MCP surface

The MCP server provides 18 tools for Claude Code and other MCP clients, grouped by domain.

**Forge:** `forge_list_projects`, `forge_create_project`, `forge_publish_project`

**Tasks:** `tasks_list_projects`, `tasks_list_tasks`, `tasks_claimable`, `tasks_get_instructions`, `tasks_claim`, `tasks_transition`, `tasks_create`

**Deploy:** `deploy_list_servers`, `deploy_list_apps`, `deploy_app`, `deploy_status`, `deploy_preflight`, `deploy_rollback`, `deploy_history`

**Aggregation:** `dashboard_summary`

See [configuration.md](configuration.md) for env vars and [api.md](api.md) for the HTTP surface.

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
| `/security` | Depsight CVE / repo health view |
