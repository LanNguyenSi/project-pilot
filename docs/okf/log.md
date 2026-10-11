# Log

<!-- Add new entries at the top, newest first. -->

- 2026-10-11T12:40:55Z, bundle introduced: `okf-kit init docs/okf` scaffold, the
  unused type templates removed, and three docs written and verified against
  their sources: credential-trust-boundary (invariant),
  request-gating-and-sessions (invariant), forge-task-migration (module).
  Every code citation carries a string anchor on its last cited line. CI
  watches staleness warn-only through `.github/workflows/okf-staleness.yml`
  (okf-kit 0.16.0, `--require-anchors`). `okf-kit check --json
  --require-anchors docs/okf` on the committed tree: no errors, no warnings.
