# Contributing to project-pilot

Thanks for your interest. project-pilot is the unified control plane for the full project lifecycle: Create (project-forge), Develop (agent-tasks), Deploy (deploy-panel).

## Issues

- Bug reports: include repro steps, expected vs. actual, the affected surface (`backend`, `frontend`, `mcp`).
- Feature requests: describe the use case before the proposed shape.
- For module-specific bugs (project-forge / agent-tasks / deploy-panel), prefer the module's own repo.

## Pull Requests

1. Fork, branch off `main` (e.g. `feat/<scope>`, `fix/<scope>`).
2. Keep changes scoped where possible.
3. Run the checks CI runs for every workspace you touched:

   ```bash
   npm install

   # backend
   npm run db:generate --workspace=backend
   npm run lint --workspace=backend
   npm run lint:test --workspace=backend
   npm run build --workspace=backend
   npm run test:coverage --workspace=backend

   # frontend
   npm run typecheck:test --workspace=frontend
   npm run build --workspace=frontend
   npm run test:coverage --workspace=frontend

   # mcp
   npm run typecheck:test --workspace=mcp
   npm run build --workspace=mcp
   npm run test:coverage --workspace=mcp
   ```

   Coverage thresholds in each workspace's `vitest.config.ts` are enforced in CI.

4. Open the PR with a clear summary, motivation, and test plan.

## Dev Setup

```bash
git clone https://github.com/LanNguyenSi/project-pilot.git
cd project-pilot
make dev-full
```

`make dev-full` runs Postgres in Docker and the backend and frontend as local dev servers with hot reload (see the [README quick start](README.md#quick-start)). To run everything in containers instead, use `docker compose up`.

## Style

Match the surrounding code. Prefer small, reviewable diffs.
