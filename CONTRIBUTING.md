# Contributing to project-pilot

Thanks for your interest. project-pilot is the unified control plane for the full project lifecycle: Create (project-forge), Develop (agent-tasks), Deploy (deploy-panel).

## Issues

- Bug reports: include repro steps, expected vs. actual, the affected surface (`backend`, `frontend`, `mcp`).
- Feature requests: describe the use case before the proposed shape.
- For module-specific bugs (project-forge / agent-tasks / deploy-panel), prefer the module's own repo.

## Pull Requests

1. Fork, branch off `main` (e.g. `feat/<scope>`, `fix/<scope>`).
2. Keep changes scoped where possible.
3. Run the local checks scoped to the affected workspace:

   ```bash
   npm install
   npm run build --workspace=<surface>
   npm run test  --workspace=<surface>
   ```

4. Open the PR with a clear summary, motivation, and test plan.

## Dev Setup

```bash
git clone https://github.com/LanNguyenSi/project-pilot.git
cd project-pilot
npm install
docker compose up
```

## Style

Match the surrounding code. Prefer small, reviewable diffs.
