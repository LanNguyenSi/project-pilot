# project-pilot

Unified control plane for the full project lifecycle: **Create**, **Develop**, **Deploy**, all in one dashboard.

[![CI](https://github.com/LanNguyenSi/project-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/LanNguyenSi/project-pilot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

project-pilot aggregates three independent services, [project-forge](https://github.com/LanNguyenSi/project-forge) (scaffolding), [agent-tasks](https://github.com/LanNguyenSi/agent-tasks) (task management), and [deploy-panel](https://github.com/LanNguyenSi/deploy-panel) (VPS deploys), behind a single login. Service credentials are stored encrypted per user and can be checked with **Test** after saving. A separate stdio MCP server gives AI agents access to the same three services, using keys from its own environment. The backend is a Hono API with Zod-validated inputs: it owns accounts, sessions, GitHub sign-in and the stored credentials, and forwards all other calls to the three services. The frontend is Next.js 15 with a unified dark-mode UI.

![The project-pilot dashboard: aggregated stats across the three connected services (projects via agent-tasks, open tasks, servers online, apps deployed) with quick actions.](docs/img/dashboard.png)

## Key features

- Create (project-forge): scaffold, preview, and publish a project to GitHub from `/forge`, then migrate its generated tasks into agent-tasks
- Develop (agent-tasks): browse and search projects, create projects, sync a team's GitHub repos, create tasks, and read agent instructions from `/tasks`
  (claiming, transitions, and the signals inbox go through the agent-tasks API/MCP, not this UI)
- Deploy (deploy-panel): add and remove servers, test relay connectivity, install a relay on a VPS, list apps,
  trigger deploys, watch status, view deploy logs, and filter or paginate history from `/deploys`
  (preflight and rollback are available through the HTTP API and MCP tools, not this UI)
- Unified dark-mode dashboard with aggregated stats from agent-tasks and deploy-panel, plus connection status
  for project-forge, and error boundaries for graceful failure handling
- Encrypted per-user service credential storage, with a **Test** check for each saved credential
- MCP server exposing 18 tools (forge, tasks, deploy, plus `dashboard_summary`) over stdio
- Password reset flow (forgot password / reset with token)
- Security headers (CSP, HSTS in production) and Zod validation on all JSON request bodies

## Quick start

Prerequisites: Node.js >=20, make, Docker with Compose v2 (for the Postgres container).

```bash
git clone https://github.com/LanNguyenSi/project-pilot.git
cd project-pilot

# Install + start Postgres + push schema + run dev servers in one shot
make dev-full
```

`make dev-full` installs deps, starts the `db` container, generates the Prisma client, copies `.env.example` files if missing, pushes the schema, and starts both servers.

- Frontend: http://localhost:3000
- Backend:  http://localhost:3001

Then connect your existing service credentials:

1. Register an account at http://localhost:3000/login. If GitHub OAuth is configured (see [GitHub sign-in](docs/configuration.md#github-sign-in)), **Continue with GitHub** registers you with each service and fills `/settings` for every service that accepts the registration.
2. Open `/settings`.
3. Paste your `pf_...` Forge key, agent-tasks Bearer token, and `dp_...` Deploy key, click **Save**, then click **Test** on each. The project-forge **Test** reports a valid key as rejected ("Service rejected the request"); open `/forge` to confirm that key instead.
4. Visit `/dashboard`, you should see stats from agent-tasks and deploy-panel and the project-forge connection status.

Need to run the steps individually? See [docs/configuration.md](docs/configuration.md#manual-setup).

## Usage

The MCP server exposes 18 tools (forge, tasks, deploy, plus `dashboard_summary`) over stdio for Claude Code and other MCP clients:

```json
{
  "mcpServers": {
    "project-pilot": {
      "command": "npx",
      "args": ["tsx", "/path/to/project-pilot/mcp/src/index.ts"],
      "env": {
        "FORGE_API_KEY": "pf_...",
        "TASKS_TOKEN":   "at_...",
        "DEPLOY_API_KEY":"dp_..."
      }
    }
  }
}
```

The snippet above runs the server from source with `tsx`. Alternatively, run `npm run build` in `mcp/` and point the client at the compiled `project-pilot-mcp` bin (`mcp/dist/index.js`).

Full tool list: [docs/architecture.md](docs/architecture.md#mcp-surface). Env reference: [docs/configuration.md](docs/configuration.md#mcp-server).

## Documentation

| If you want to... | Read |
|------|------|
| See how project-pilot fits into the wider tool ecosystem | [docs/ecosystem.md](docs/ecosystem.md) |
| Understand the aggregation model and MCP surface | [docs/architecture.md](docs/architecture.md) |
| Configure env vars, credentials, password reset, Docker | [docs/configuration.md](docs/configuration.md) |
| Browse the HTTP API and Zod input validation | [docs/api.md](docs/api.md) |
| See planned work | [docs/roadmap.md](docs/roadmap.md) |

## Development and contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, per-workspace build/test commands, and PR guidelines.

## License

MIT.
