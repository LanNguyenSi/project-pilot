# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-05-25

**Headline: Initial release. Unified control plane that aggregates project-forge (scaffolding), agent-tasks (task management), and deploy-panel (VPS deploys) behind a single login, with an 18-tool stdio MCP server for AI agents.**

### Added

#### Web app (`frontend`, Next.js 15)

- Unified dark-mode UI with login, password reset, and per-user settings page.
- `/dashboard` aggregates stats from all three connected services (project counts, task counts, deploy history) into a single landing page.
- `/forge`, `/tasks`, `/deploys`: list, search, and act on resources from each upstream service without leaving project-pilot.
- `/settings`: paste service credentials (`pf_...` Forge keys, agent-tasks Bearer tokens, `dp_...` Deploy keys), validate via **Test Connection**, store encrypted server-side.
- Pagination and search on tasks, deploys, and projects.
- Deploy history filters: by server, app, status, date range.
- Error boundaries for graceful failure handling.

#### Backend (`backend`, Hono + Prisma + Postgres)

- Thin proxy around the three upstream services; never stores upstream tokens in plaintext (AES-256-GCM at rest, decrypted only at request time).
- Zod input validation on every endpoint.
- Session-based auth with bcrypt password hashing and a forgot-password / reset-with-token flow.
- Security headers in production (CSP, HSTS).
- Prisma schema migrations + a `db-push` script for first boot.

#### MCP server (`mcp`)

- Stdio MCP server exposing **18 tools** across forge, tasks, deploy, plus a `dashboard_summary` aggregation. Drop-in for Claude Code and other MCP clients via the snippet in the README.

#### CI / Release

- `.github/workflows/ci.yml`: lint + build for `backend` and `frontend` on push and PR to `main`/`develop`. Now also exposes `workflow_call:` so the new release workflow can re-use it.
- `.github/workflows/release.yml`: on `v*` tag push, runs CI, extracts the matching `## [<version>]` section from this CHANGELOG, and publishes a GitHub Release (`softprops/action-gh-release@v2`). Matches the canonical pattern used across the LanNguyenSi org.

#### Open-source surface

- LICENSE (MIT), CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GitHub issue + PR templates (#68).
- `make dev-full` for one-shot local boot (install, postgres up, prisma generate + push, env file scaffolding, dev servers).
- Architecture, configuration, ecosystem, and API docs under `docs/`.

### Security (already on `main` going into this tag)

- `fast-uri`, `hono`, `ip-address`, `express-rate-limit` bumped to clear CVE sweep 2026-05-10 (#69).
- `postcss` pinned to `>= 8.5.10` via override to close GHSA-qx2v-qp2m-jg93 (#70).
- `qs` bumped to `6.15.2` for CVE-2026-8723 (#74).

### Production

- `docker-compose.prod.yml` ships project-pilot behind Traefik at `project-pilot.opentriologue.ai` with automatic HTTPS.

### Verification

- `npm run lint --workspace=backend`: clean.
- `npm run build` (backend + frontend): green.
- CI workflow has been running per-PR for weeks; the `workflow_call:` addition is a no-op at PR time.
- This is the first tag, so no upgrade notes apply.
