# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.1] - 2026-06-09

Security release closing the 2026-05-30 audit findings and a CVE sweep. The headline is a HIGH-severity GitHub OAuth account-takeover. No feature changes; the app is versioned at the repo root and deployed from `main`, so this tag is deploy provenance.

### Security

- **HIGH: GitHub OAuth account takeover via githubId overwrite** (PR #81). The OAuth callback merged identities by the attacker-controllable public profile email, without verifying it or checking whether the matched row already belonged to a different GitHub account, so an attacker could register a GitHub account whose profile email matched a victim's, sign in, and silently overwrite the victim's `githubId`, hijacking the account. The merge key now comes from the primary VERIFIED email (new `fetchPrimaryVerifiedEmail` helper reading `GET /user/emails`, which required adding the `user:email` OAuth scope), and a merge onto a row that already carries a different `githubId` is refused.
- **MEDIUM: brute-force rate limiting bypassable via spoofed `X-Forwarded-For`** (PR #84, finding #15). The limiter trusted the leftmost XFF value, which a client controls. It now takes the rightmost hop (single trusted proxy / Traefik), falls back to the real TCP socket via `getConnInfo` when XFF is absent, and keys the login / forgot-password limiters on the submitted email in addition to the IP.
- **hono bumped to `^4.12.23`** (4 MEDIUM CVEs: CVE-2026-47673 / 47674 / 47675 / 47676, PR #83). npm audit clean.
- **vitest bumped to `^4.1.8`** (CVE-2026-47429 / GHSA-5xrq-8626-4rwp, PR #82). vitest < 4.1.0 lets the UI server read and execute arbitrary files. devDependency; lockfile regenerated.

## [0.2.0] - 2026-05-28

**Headline: Forge projects can hand their planning backlog straight to agent-tasks. After scaffolding a repo in project-forge, one click in the Forge UI creates the matching agent-tasks project and imports the generated planforge tasks, so the plan becomes trackable work without re-typing it.**

### Added

- **Forge to agent-tasks task migration** (#78). A "Migrate tasks" button on each Forge project card (shown when no agent-tasks project is linked yet). It finds or creates the agent-tasks project bound to the repo, then batch-imports the planforge tasks. `externalRef` is the planforge task id, so a second run imports only genuinely new tasks. Team resolution mirrors agent-tasks: a single team is used silently, multiple teams open a picker, none surfaces a clear error.
- **Task snapshot at generate.** The backend persists `preview.tasks` from `/forge/generate` in a new `ForgeTaskSnapshot` table (keyed at publish by a normalized `owner/repo`), so the tasks survive the stateless forge session and can be migrated later. Snapshot writes are best-effort and never break generate or publish.
- `POST /api/forge/migrate-tasks` and the shared `agent-tasks-client` extracted from the tasks proxy route.
- `ApiError` in the frontend API client carries HTTP status + parsed body so the UI can branch on a structured error (e.g. the multiple-teams team picker).

### Fixed

- Request the GitHub `workflow` OAuth scope so the forwarded SSO token can push scaffolds containing `.github/workflows/*` (#79).
- Validate downstream service URLs in the Zod config schema (#77).

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
