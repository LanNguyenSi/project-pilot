# Log

<!-- Add new entries at the top, newest first. -->

- 2026-10-15T12:39:53Z, credential-trust-boundary re-verified against its
  sources and re-stamped: `backend/src/routes/dashboard.ts` is now one of its
  sources, and the dashboard summary route is described as the exception to the
  error pattern, pre-checking each credential's readability with
  `getCredential`, flagging an unreadable service `unreadable: true` and
  skipping its downstream calls instead of letting `CredentialUnreadableError`
  reach `app.onError`. request-gating-and-sessions: its dashboard citation was
  re-pointed to `backend/src/routes/dashboard.ts:20`.
  `okf-kit check --json --require-anchors docs/okf`: no errors.
- 2026-10-15T04:27:24Z, citations re-pointed and re-stamped after a review. Four
  `backend/prisma/schema.prisma` citations (credential-trust-boundary and
  forge-task-migration) and five `backend/src/app.ts` citations
  (credential-trust-boundary and request-gating-and-sessions) now cover the
  lines their anchors sit on after the schema and error handler shifted.
  credential-trust-boundary: `app.onError` logs one line for an unreadable
  credential. A script that checks every `path:start-end#"anchor"` citation
  finds none out of range; `okf-kit check --json --require-anchors docs/okf`
  does not check `.prisma` anchors.
- 2026-10-15T04:19:15Z, all three docs re-verified against their sources and
  re-stamped after a source change. credential-trust-boundary: a stored
  credential that cannot be decrypted is now caught in `getCredential` and
  surfaces as `CredentialUnreadableError`; the validate route reports it as
  `valid: false` and every other caller gets a 409 `credential_unreadable`
  from `app.onError` instead of a 500. request-gating-and-sessions: the CSRF
  middleware comment now names Strict and Lax. forge-task-migration: only
  citations moved.
  `okf-kit check --json --require-anchors docs/okf`: no errors, no warnings.
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
