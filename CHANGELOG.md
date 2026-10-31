# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **`@hono/node-server` 2.1.5** (GHSA-rmxm-3fg6-px4f): the lockfile resolves 2.1.5 (was 2.0.12), which fixes `serveStatic` decoding the request path a second time and so letting a request bypass middleware on static paths (affected: `>= 1.19.10, < 2.1.3`). Lockfile only, a direct dependency whose range is unchanged.

### Added

- **Database backup, a tested restore and a restore drill in CI.** The production database had no routine backup and no restore procedure: only a manual `pg_dump` hint for destructive schema changes, and `rollback: true` in `.relay.yml` restores code only. `scripts/backup.sh` (`make backup`) runs `pg_dump -Fc` through `docker compose -f docker-compose.prod.yml exec -T db`, writes to a hidden temp file, validates it (at least 1 KiB, then a complete read of the archive with `pg_restore -f /dev/null` in the db container, which a truncated or corrupt file fails) and only then renames it to `project-pilot-<timestamp>.dump` (modes 700/600). Dumps go to `$HOME/project-pilot-backups` by default (`BACKUP_DIR` overrides; an empty value counts as unset) and a directory inside the checkout is refused, because agent-relay refuses to deploy a tree with untracked files and the Docker build context is the repository root. It refuses when the `db` service is not running or when the compose file is the development stack, rotates by `KEEP_FILES` and `KEEP_DAYS` (default 14 each, never after a failed run), and calls an optional `BACKUP_OFFHOST_HOOK` with the dump path (exit 3 when the hook fails, the local dump is kept). `scripts/restore.sh --yes <dump>` (`make restore FILE=... CONFIRM=yes`) converts the dump to SQL with `pg_restore` (a truncated or corrupt archive fails before anything is changed), stops the backend, takes a dump of the current state first (`--no-pre-backup` skips it), drops and recreates the `public` schema and loads the SQL inside one explicit `BEGIN` ... `COMMIT` (sent only after the whole SQL was read, so an unreadable copy rolls back instead of committing an empty schema), then re-applies the schema with `prisma db push` in a one-off backend container without `--accept-data-loss` and starts the backend; it never runs without a file and without `--yes`. CI gains `Backup scripts` (shellcheck and stub-`docker` tests for both scripts) and `Restore drill (Postgres)` (`scripts/restore-drill.sh`: the real scripts round-trip a seeded database into a fresh one, then into a populated one with a newer-schema table and a post-dump row, which must both be gone, and a truncated dump or a vanished SQL copy must leave the database unchanged). Scheduling the backup and the off-host copy stay the operator's job; nothing runs until a cron entry is installed. A dump holds user, session and credential rows and is useless without the `.env` (`SESSION_SECRET` encrypts the stored credentials). See [Backup and restore](docs/configuration.md#backup-and-restore).

### Changed

- `engines.node` of the root and `frontend` packages is now `^20.19.0 || ^22.13.0 || >=24`, the range ESLint 10 supports (was `>=20`). `backend` and `mcp` do not run ESLint and keep `>=20`. CI already uses Node 22.

- **ESLint 9 to ESLint 10 (dev tooling).** `eslint` is now `^10.14.0` (also a root devDependency, so every plugin resolves to the one ESLint 10 instead of npm pulling in a second, deprecated ESLint 9 for the plugins that do not declare 10 yet) and `eslint-config-next` is `^16.4.3`, which officially supports ESLint 10; `next` stays on 15. `npm install` prints `ERESOLVE overriding peer dependency` for `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y` and `npm ls eslint` lists them as invalid peers; eslint-config-next 16 shims them, and lint, build and tests run clean. `@eslint/eslintrc` and `@eslint/js` left the tree, and `frontend/eslint.config.mjs` now uses `defineConfig` from `eslint/config` with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` instead of `FlatCompat` (the ignores block is unchanged). Rule coverage per `--print-config` (rule, severity and options) is the base plus `eslint-plugin-react-hooks` 7: the React Compiler rules `react-hooks/config`, `error-boundaries`, `gating`, `globals`, `immutability`, `incompatible-library`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `unsupported-syntax` and `use-memo`, plus `@next/next/no-location-assign-relative-destination`; the config never enabled `eslint:recommended`, so the new ESLint 10 recommended rules and the `no-constant-condition` default change do not apply. `react-hooks/set-state-in-effect` is a warning (not an error) in `deploys/page.tsx` and `tasks/page.tsx`, where the rule flags async fetchers called from an effect that set state only after an await and that are shared with event handlers; everywhere else it is an error. Code fixes, behaviour unchanged: `Modal` and `TaskDetailPanel` take the client-mounted flag from a new `useMounted` hook (`useSyncExternalStore`) instead of a mount effect, `useFocusTrap` keeps the latest `onClose` in a layout effect instead of writing a ref during render, `AppShell` reads the sidebar-collapsed flag from localStorage through `useSyncExternalStore` (expanded on the server and during hydration, as before; the toggle flips the stored value), and `InstallRelayWizard` (reset on close), `Select` (highlighted option re-sync) and `TaskDetailPanel` (loading reset when the task changes or the panel reopens) do their state reset during render when the prop changes, with the stream abort, the outside-click listener and the fetch staying in effects. Behaviour change: a `storage` event from another tab now updates the collapsed sidebar too. New tests: `frontend/tests/modal-focus-trap.test.tsx`, `app-shell-collapse.test.tsx`, `select-sync.test.tsx`, `task-detail-panel.test.tsx` and a close-mid-flow case in `install-relay-wizard.test.tsx`. The lockfile was written with npm 10.9.9 (Node 22); besides the ESLint tree, `@babel/*` and `caniuse-lite` moved by patch versions because `eslint-plugin-react-hooks` 7 depends on `@babel/core`, and `es-object-atoms` 1.1.1 to 1.1.2 (patch, shared with the express tree of `mcp` and `backend`). ESLint 10 needs Node `^20.19.0 || ^22.13.0 || >=24`; CI and the Dockerfiles use Node 22, while `engines.node` stays `>=20`.

### Fixed

- **The backend container no longer runs `prisma db push` on start.** The image `CMD` was `prisma db push && node dist/server.js`, so every deploy had two actors pushing DDL (the container start and the relay `post_update` step), `prisma db push` is not transactional, and a failing start push put the container into a restart loop that made the `post_update` `exec` hit a restarting container. The `CMD` now only starts the server (`node dist/server.js`); the relay `post_update` push stays the single production schema step, still without a data-loss flag (`.relay.yml` unchanged). The development stack (`docker-compose.yml`) gets a one-shot `migrate` service that applies the schema before the backend starts, so `docker compose up` keeps working. `backend/tests/deploy-config.test.ts` pins both. Deploy note: the next production deploy builds the image without the start push, so after `compose up -d` the new backend serves against the previous schema for the few seconds until `post_update` applies it, and a container restart without a deploy no longer touches the schema. A restart on a host whose database was never pushed now starts a server with an empty schema; run `make deploy` or the manual push in `docs/configuration.md`. No one-time operator step otherwise.

- **Dev setups no longer block every browser API call.** `connect-src` was `'self'` only, while in dev the frontend on `:3000` calls the API on `http://localhost:3001` (`NEXT_PUBLIC_API_URL`), a cross-origin call the CSP blocked. The CSP is now built by a pure, unit-tested `buildCsp(env)` (`frontend/src/lib/csp.ts`), called from `frontend/next.config.ts`; `connect-src` is `'self'` plus the origin (`new URL(...).origin`, never a path or wildcard) of `NEXT_PUBLIC_API_URL` with the same default as `frontend/src/lib/api.ts`, and an unparseable value adds nothing (no crash, `'self'` only). In production the API origin equals the page origin, so the result is unchanged there. Verified against a running `next start` and `next dev` server (`/login` response carries the header in both). `docs/configuration.md` and the request-gating knowledge bundle now describe this; `docs/architecture.md` also lists `validate` (`zValidate`, `urlString`) in the `backend/src/lib/` module map, which every POST/PUT route imports.

- **A new backend container starts without network access to `binaries.prisma.sh`.** The `builder` and `prod-deps` stages of `backend/Dockerfile` ran `npm ci` without openssl, so the Prisma CLI engines from the `@prisma/engines` postinstall (and the client's native engine) targeted openssl 1.1 while the runner has openssl 3; every new container downloaded the openssl-3.0.x engines for its platform (`linux-musl-openssl-3.0.x` on amd64, `linux-musl-arm64-openssl-3.0.x` on arm64) before `prisma db push`. Separately, on arm64 the generated client's native engine targeted openssl 1.1 and did not match the runner. Both stages now run `apk add --no-cache openssl` before `npm ci`, so the engines in the image match the runner. The `binaryTargets` route was not chosen: it only affects the generated client, not the CLI engines that `prisma db push` uses. Measured with an internal Docker network (Postgres reachable, no route out): the old image exits on the engine download on linux/amd64 and arm64, the new one runs db push and the server to healthy on both. The amd64 image shrinks from 498 MB to 450 MB; arm64 is unchanged at 482 MB.

## [0.6.0] - 2026-10-25

### Changed

- **Dev compose is isolated from production**: `docker-compose.yml` now sets `name: project-pilot-dev`, and pins the dev volume's own name `project-pilot-dev_pgdata` (instead of `<directory>_pgdata`), so `COMPOSE_PROJECT_NAME`, the shared `.env` or `-p` cannot point it back at the production volume; CI fails if the dev and prod pgdata volume names are equal, if any dev volume (in any compose profile, as `-f docker-compose.yml` or as a plain `docker compose` resolves it) carries the production name, or if a dev service uses `volumes_from`. Previously, running the dev file in the production checkout directory attached to the production `pgdata` volume with the dev password and could overwrite or expose it. The dev Postgres now publishes on `127.0.0.1:5432` only instead of all interfaces. The production compose project name and volume are unchanged. Upgrade note: an existing local dev database stays in the old volume; re-seed with `make docker-up && make db-push` or copy the volume once (see `docs/configuration.md`, "Dev database volume and port").

- The frontend now self-hosts its fonts: `next/font/google` (Space Grotesk 500/600/700, Inter 400/500/600, JetBrains Mono 400/500) is replaced by `next/font/local` with vendored variable woff2 files and their OFL licenses in `frontend/src/fonts/`. `next build` no longer contacts fonts.googleapis.com or fonts.gstatic.com, so a malformed or throttled Google response can no longer fail CI or a deploy. The `--font-display`, `--font-sans` and `--font-mono` variables and `display: swap` are unchanged. Every subset the Google CSS served is vendored (latin, latin-ext and, where the family has them, cyrillic, cyrillic-ext, greek, greek-ext, vietnamese), so glyph coverage is unchanged; a subset file loads only when a glyph in its `unicode-range` is rendered. CI gains a guard that fails when `next/font/google` is imported again.

- Every service in `docker-compose.prod.yml` now has json-file log rotation (`max-size: 10m`, `max-file: 3`, shared through an `x-logging` anchor) and a memory limit set with `mem_limit` (db `1g`, backend `768m`, frontend `512m`), so a chatty or leaking container can no longer fill the host disk or memory. `mem_limit` is the Compose spec key that plain `docker compose up -d` applies without swarm, and it shows up in `docker compose config` output.

- `NEXT_PUBLIC_*` frontend variables are now passed to the image as build arguments, and `NEXT_PUBLIC_DEPSIGHT_URL` is listed in `frontend/.env.example`. The unused `ApiKey` Prisma model and the unused `getForgeStats` helper are removed (the schema is applied with `prisma db push`; there is no migrations directory).

### Fixed

- **Deploys no longer accept data loss.** The relay `post_update` step ran `prisma db push --accept-data-loss`, so a schema change that drops a populated column or table (or adds a UNIQUE constraint over duplicates) was applied silently. It now runs `prisma db push` without the flag, matching the backend start command. Upgrade note: a destructive schema change now stops the deploy with Prisma's data-loss error instead of dropping data; apply it deliberately with a backup and a one-off `docker compose run --rm --no-deps` push from the new image (see `docs/configuration.md`; an `exec` into the running backend does not work after a rollback). `make deploy` now runs the same sequence as the relay path (push without the flag, then a bounded `/api/health` wait, non-zero exit on failure; `HEALTH_TRIES` and `HEALTH_INTERVAL` must be positive integers, otherwise it exits before touching anything) instead of only `git pull` and compose up.

- **Docker images install from the lockfile.** `backend/Dockerfile` and `frontend/Dockerfile` now run `npm ci` against the root workspace `package-lock.json` instead of `npm install` on a copied `package.json`, so production images resolve the same dependency versions CI tests. The build context of both services in `docker-compose.yml` and `docker-compose.prod.yml` is now the repository root (`dockerfile: backend/Dockerfile`, `dockerfile: frontend/Dockerfile`); build them from the root, for example `docker build -f backend/Dockerfile .`. A root `.dockerignore` replaces the per-workspace ones and keeps `.git`, `.env*` and `node_modules` out of the context. In the frontend image the standalone server now starts as `node frontend/server.js` because Next traces from the repository root. The backend runtime image installs only the backend's production dependencies (`npm ci --omit=dev`) plus the `prisma` CLI, its engines and the generated client that `prisma db push` needs at start; test and tooling packages (vitest, jsdom, concurrently, typescript, tsx) stay out of it. The images build with the npm bundled in `node:22-alpine`, no global npm upgrade. `.dockerignore` also excludes `*.db`, `*.pem`, `*.key` and `.npmrc` files in any directory.

- **The dashboard no longer shows every service as "Not configured" when a stored credential cannot be decrypted** (e.g. after `SESSION_SECRET` changed). `GET /api/dashboard/summary` now checks each stored credential's readability up front: a service whose credential fails to decrypt is reported with the optional `unreadable: true` field (`configured` stays `true`) and its downstream calls are skipped, while the other services still report their data. The dashboard renders a distinct **Credential unreadable** badge for that service plus a hint to re-enter it in Settings; the stat-card state mapping moved to `frontend/src/lib/service-state.ts` with its own unit test.

- **A stored credential that cannot be decrypted now answers 409 `credential_unreadable` instead of 500.** The credential Test and validate calls report it as a re-enter message (validate answers `valid: false`), and the error handler logs one line (method, path, service) so a `SESSION_SECRET` rotation is visible in the backend log.

- **The credential Test for project-forge now sends the `X-API-Key` header to `/api/v1/projects`**, matching what the forge API expects.

- **The production backend container start fails when `prisma db push` fails** instead of continuing, so under the prod restart policy a failed schema push restart-loops the backend rather than serving against a stale schema (see `docs/configuration.md`).

### Security

- **The backend refuses to start in production on a placeholder `SESSION_SECRET` or unset service URLs.** With `NODE_ENV=production` the config layer now rejects the `SESSION_SECRET` values shipped in `backend/.env.example` and `docker-compose.yml` (they clear the existing min 16 char rule but are public), and requires `PROJECT_FORGE_URL`, `AGENT_TASKS_URL` and `DEPLOY_PANEL_URL` to be set to a non-empty value: a missing or empty one fails startup with an error naming every missing variable. Outside production the placeholder is accepted and the URL defaults apply (a URL set but empty there also counts as unset), each with a single warning, so local development is unchanged. `docker-compose.prod.yml` passes the three URLs through as required `${NAME:?...}` variables. Upgrade note: set `PROJECT_FORGE_URL`, `AGENT_TASKS_URL` and `DEPLOY_PANEL_URL` and a real (non-placeholder, min 16 char) `SESSION_SECRET` in the production `.env` before deploying, otherwise the backend will not start.

- **zod 4** (GHSA-mrhx-c7xc-m3w5): the `backend` and `mcp` workspaces move from zod 3.25 to zod 4.6.7 (still exactly one lockfile resolution), which fixes memory exhaustion while validating oversized constrained collections; `@hono/zod-validator` moves to 0.9.1 for its zod 4 support. The 400 validation error keeps the same envelope on the wire (`{ success: false, error: { issues: [...], name: "ZodError" } }`, status 400, pinned by tests on the encoded response); the per-issue entries inside it follow zod 4 (issue codes, messages and fields are zod 4's). `z.guid()`/`z.email()` keep the zod 3 accept sets and output values, and URL fields (`repoUrl`, `relayUrl`) use a `urlString()` helper (the zod 3 `new URL()` check via `.refine()`) so accepted values pass through byte for byte instead of being trimmed and stripped the way zod 4's `z.url()` normalizes them.

- **Tailwind CSS 4** (GHSA-rj75-hqrm-r3gf): the frontend moves from Tailwind 3.4 to 4.3 (`@tailwindcss/postcss`, CSS-first `@theme` in `globals.css`, `tailwind.config.ts` and `autoprefixer` removed), which drops the vulnerable `postcss-selector-parser` 6.x from the lockfile. Opacity-modified theme colours such as `bg-brand-500/10` now render as written (Tailwind 3 silently dropped them), so active tabs, the avatar, badges and error banners show their intended tint.

- **body-parser 2.4.0** (GHSA-27r3-jxmh-p828): the lockfile resolves 2.4.0 (with iconv-lite 0.7.3 and qs 6.16.1, which it requires), so trailing bytes after a compressed request body no longer cause a denial of service.

- **fast-uri 3.1.9** (GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr, GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp): the lockfile resolves 3.1.9, which fixes scheme spoofing, host confusion, path equivalence and scheme injection in URI parsing. It is installed through `ajv`.

- **undici 8.12.3** (GHSA-xjj6-f33q-929c, GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472): the lockfile resolves 8.12.3, which fixes a denial of service via excessive content-encodings, unbounded memory in the EventSource parser and a Subresource Integrity bypass. It is a development dependency.

- **next 15.5.27** (GHSA-mcj8-r9mp-w47p, GHSA-4jqv-mc3x-m676): the lockfile resolves 15.5.27 with its matching `@next/env` and `@next/swc-*` packages and the `next` dependency floor is now `^15.5.27`.

- **next 15.5.28** (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r): the lockfile resolves 15.5.28 with its matching `@next/env` and `@next/swc-*` packages and the `next` dependency floor is now `^15.5.28`, superseding the 15.5.27 entry above.

- **ip-address 10.7.4** (GHSA-rxp7-6hxx-x8q5), installed through `@modelcontextprotocol/sdk` and `express-rate-limit`: the lockfile resolves 10.7.4, the first release patched for the quadratic-time `Address6` zone-identifier match.

- **`@modelcontextprotocol/sdk` 1.32.1** (GHSA-6qxp-vccf-f47h, task aff72e2b): the lockfile resolves 1.32.1 and the `mcp/` dependency range is now `^1.32.1`, so consumers cannot resolve an affected version. Since 1.30.1 the SDK's HTTP server transports apply a 4 MiB default request-body limit and a 100-message batch cap.

- **sharp 0.35.5** (GHSA-wq5f-xc86-pv6w, task aff72e2b), installed through `next`: the lockfile resolves 0.35.5 with matching `@img/*` binaries and the `sharp` override floor is now `^0.35.5`.

- **shell-quote 1.12.0** (GHSA-pqg4-j6r4-53mv, critical, dev scope through `concurrently`, task aff72e2b): the lockfile resolves 1.12.0 and the override floor is now `^1.12.0`.

- **`npm audit` gate now classifies with an ID-scoped, dated allowlist.** The audit workflow's gate step hands `npm audit --audit-level=high --json` output to `scripts/audit-gate.mjs` (dependency-free, vendored verbatim from depsight commit be8c7ea) and reads `.github/audit-allowlist.json`. The one entry excepts GHSA-vfj7-8cjw-p6xm (`braces` 3.0.3, dev dependency only, no upstream fix) by exact advisory id until its `reviewBy` date (2026-11-06); every other HIGH or CRITICAL advisory still fails the gate, as does an expired entry. A self-test (`scripts/audit-gate.test.mjs`, `node --test`) runs in the audit job before the gate.

- The `Audit` gate is re-vendored from depsight #172: `scripts/audit-gate.mjs` now treats a report whose `metadata.vulnerabilities` HIGH plus CRITICAL tally disagrees with, or is missing against, its `vulnerabilities` map as UNCLASSIFIED (exit 3), prints npm's stderr itself through a sanitiser (each line behind an `npm stderr| ` prefix, reduced to a safe character set, length and count bounded) instead of the workflow step copying it raw, and the gate step fails (exit 3) when the classifier exits 0 without the `npm audit gate: CLEAN` line. The non-blocking report step prints npm's output between `::stop-commands::` and a per-run random resume token. The allowlist entries are unchanged. Tracker task dbbc4994.

## [0.5.0] - 2026-10-05

**Headline: dependency-aware forge import and server Test Connection.** The forge task import can now wire task dependencies, deploy servers get a per-server Test Connection action, upstream timeouts are recognised at every backend call site, and a long run of dependency security fixes lands. The app is versioned at the repo root and deployed from `main`, so this tag is deploy provenance.

### Added

- **Dependency-aware forge task import** (#125): tasks are imported in topological order and `dependsOn` edges are wired at create time, with idempotent re-runs that resolve existing tasks by `externalRef`. It falls back unchanged to the flat batch import when no task carries dependencies.
- **Per-server Test Connection action on the Deploys Servers tab** (#120): checks relay connectivity through deploy-panel and refreshes the row's status badge, with a distinct warning state for servers without a relay.
- **Hint on the Add Server modal that a server without a relay URL cannot deploy yet** (#102).
- **Auth context in the app shell** (#122): `/api/auth/me` is fetched once per shell mount instead of by the top bar and the dashboard separately.

### Changed

- **Empty values render as a middle dot everywhere** (#122), and long names in Select triggers are truncated instead of overflowing.
- **Backend build generates the Prisma client** (#112), so `npm run build` works from a clean checkout.
- **Backend `zod` range widened to `^3.25.0`** (#116), so the workspace resolves a single `zod` and the mcp workspace builds again; CI and the root `npm run build` now build the mcp workspace, and CI asserts the single resolution.
- **`engines.node >=20`** declared in the root, mcp and frontend manifests (#117).
- **Backend moved to `@hono/node-server` 2.x and `@modelcontextprotocol/sdk` 1.30.0** (#114).
- **Prod image builds use npm 11** and backend `vitest` is pinned exactly (#128), fixing an npm 10 resolution crash in the Dockerfile installs.

### Fixed

- **Upstream timeouts are recognised everywhere** (#121, #123): `AbortSignal.timeout()` rejects with `TimeoutError`, which the deploy, credentials, forge and agent-tasks call sites did not match, so slow upstreams surfaced as 502 or generic errors. They now share one `isUpstreamTimeout` check: deploy, forge and agent-tasks calls return 504, and a credentials check returns a `Service timed out` validation result.
- **`apiFetch` keeps default headers when a caller passes its own** (#110): caller headers are merged on top of `Content-Type` and `X-Requested-With` instead of replacing them.

### Removed

- **Dedicated `GET /api/tasks/claimable` and `POST /api/tasks/:taskId/transition` backend proxy routes** (#131): nothing in the repo called them; the MCP client and dashboard talk to agent-tasks directly. `POST /api/tasks/:taskId/transition` now returns 404; `GET /api/tasks/claimable` is still answered by the generic task proxy.

### Security

- Dependency and lockfile fixes from the 2026 CVE sweeps (#111, #113, #115, #118, #119, #127, #135, #136, #138, #140, #141): `@hono/node-server` GHSA-frvp-7c67-39w9, `next` 15.5.25 (RCE advisories GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36), `sharp`, `hono`, `vitest`, `js-yaml` (GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh), `nanoid` (GHSA-2v37-7h3g-55p8), `postcss` floor `^8.5.18`, `fast-uri`, `qs` (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g), `ip-address`, `undici`, `brace-expansion` and `shell-quote`. A CI npm audit regression gate was added (#134).

### Docs

- **README restructured with reference material moved to `docs/`** (#139), and docs corrected to match the shipped `/tasks` surface, test scripts, security headers, validation surface and deploy routes (#129, #130, #145).

### Upgrade notes

- Node.js 20 or newer is required (`engines.node >=20`); CI and the images use Node 22.
- Callers of `POST /api/tasks/:taskId/transition` on the backend must switch to agent-tasks directly (no caller exists in this repo).
- No database migration or new environment variable is introduced by this release.

## [0.4.0] - 2026-06-25

**Headline: the relay-install wizard.** project-pilot can now onboard a fresh VPS end-to-end with a guided relay-install wizard, backed by a pre-install probe and SSH host-key pinning, plus modal/drawer portaling fixes and a dependency security pass. The app is versioned at the repo root and deployed from `main`, so this tag is deploy provenance.

### Added

- **Relay-install wizard to onboard a fresh VPS end-to-end** (#97): a guided flow that installs and wires up the deploy relay on a brand-new server.
- **Pre-install probe and SSH host-key pinning for the relay wizard** (#99): the wizard probes the target host before installing and pins its SSH host key, so the onboarding connection is verified rather than blindly trusted.

### Fixed

- **Add Server modal is scrollable and drops the dead `sshKeyPath` field** (#94): the modal no longer overflows on small viewports, and an unused field was removed.
- **Modal portals to `document.body`** (#95): the fixed overlay now escapes `<main>`'s CSS transform, so it is no longer clipped to the content area.
- **TaskDetailPanel drawer portals to `document.body`** (#96): the same transform-escape fix for the task drawer.

### Security

- **Cleared runtime `hono` and dev-only `js-yaml` advisories** (#98) via `npm audit fix`.

### Docs

- **README and docs reconciled with the code** (#93).

## [0.3.0] - 2026-06-14

**Headline: the Refined-Dark design system.** The control plane moves onto a new dark-only design foundation and every surface is lifted onto it, plus an OAuth login fix and two dependency security pins. The app is versioned at the repo root and deployed from `main`, so this tag is deploy provenance.

### Added

- **Refined-Dark design foundation** (#86): design tokens, fonts, motion, and UI primitives for the new dark-only system, with a `/styleguide` reference surface.
- **Shell, navigation, auth, and dashboard on the new system** (#87).
- **Feature surfaces lifted onto the new system** (#88).

### Fixed

- **GitHub OAuth login no longer 500s on an email collision** (#89). A login whose `githubId` matched an existing account but whose email collided with another row crashed the callback with a 500 on the githubId-update path; that path now handles the email-unique collision.

### Security

- **Pin `shell-quote` to `^1.8.4`** (#90, CVE-2026-9277, critical).
- **Force `esbuild >= 0.28.1`** (#91; GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr).

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
- Deploy history filters: by server, app, status.
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
