# Knowledge bundle index

Curated OKF knowledge bundle for the project-pilot repo. These docs capture
cross-file semantics and invariants that no single source file states on its
own: which secret protects what, which layer gates which request, and when
pilot-local state may be deleted. For the feature references, see `docs/` one
level up (`architecture.md`, `api.md`, `configuration.md`) and the root
`README.md`; these docs do not duplicate them.

## Modules

- [Forge-to-tasks migration lifecycle](forge-task-migration.md), the
  `ForgeTaskSnapshot` states from generate to publish to migration, project
  and team resolution in agent-tasks, the flat v1 batch path versus the
  dependency-aware v2 path, `externalRef` idempotency on re-runs, and the
  gate that deletes a snapshot only after a complete migration.

## Invariants

- [Credential and identity trust boundaries](credential-trust-boundary.md),
  `SESSION_SECRET` as the only key root for stored service credentials (and
  what a rotation breaks), the GitHub access token that is forwarded to the
  three module hosts and never stored, sign-in despite a failed module
  registration, and the MCP server's separate env-key trust domain.
- [Request gating and session model](request-gating-and-sessions.md),
  middleware order, CSRF registered per prefix versus `requireAuth` per
  router, hashed opaque sessions with SameSite Strict versus Lax, the rate
  limits and their single-proxy assumption, and the CSP that only the
  frontend sets.
