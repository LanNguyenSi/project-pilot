# Log

<!-- Add new entries at the top, newest first. -->

- 2026-10-11T16:05:30Z, all three docs re-verified against their sources and
  re-stamped. credential-trust-boundary: the list of callers that turn a
  `SESSION_SECRET` rotation into a 500 now includes the two direct
  `getCredential` calls in the deploy proxy, listing and deleting keep working
  because neither decrypts the token, and whether a failed registration leaves
  a user without a credential depends on whether one existed before.
  forge-task-migration: a new snapshot has `repoUrl` null, the generate route
  saves the list `extractPreviewTasks` returns, and a v2 task gets the ids of
  its own dependencies. request-gating-and-sessions: the CSRF check covers six
  route prefixes, and four of the public auth endpoints are rate-limited.
  `okf-kit check --json --require-anchors docs/okf`: no errors, no warnings.
- 2026-10-11T15:44:19Z, forge-task-migration and credential-trust-boundary
  re-verified and re-stamped. forge-task-migration no longer says which fields
  project-forge emits; the v1 path is tied to no snapshot task carrying
  `dependsOn`, and the v2 skip and delete-gate wording now says this run
  cannot apply or confirm the edges of a skipped task with dependencies of
  its own. credential-trust-boundary: a failed module registration stores no
  new credential and leaves an earlier one in place.
- 2026-10-11T12:40:55Z, bundle introduced: `okf-kit init docs/okf` scaffold, the
  unused type templates removed, and three docs written and verified against
  their sources: credential-trust-boundary (invariant),
  request-gating-and-sessions (invariant), forge-task-migration (module).
  Every code citation carries a string anchor on its last cited line. CI
  watches staleness warn-only through `.github/workflows/okf-staleness.yml`
  (okf-kit 0.16.0, `--require-anchors`). `okf-kit check --json
  --require-anchors docs/okf` on the committed tree: no errors, no warnings.
