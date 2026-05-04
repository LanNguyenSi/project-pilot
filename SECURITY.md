# Security Policy

## Supported Versions

Active development is on `main`.

project-pilot is a control plane that orchestrates project-forge, agent-tasks, and deploy-panel. Vulnerabilities (auth bypass, cross-module token leak, command injection, secret exposure) are treated as serious.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security reports.

Email **contact@lan-nguyen-si.de** with:

- Affected surface (backend, frontend, mcp)
- Reproduction steps or proof-of-concept
- Impact assessment

You will get an acknowledgement within 72 hours and an initial assessment within 7 days. A fix timeline depends on severity and complexity, communicated in the assessment.

For vulnerabilities specific to project-forge / agent-tasks / deploy-panel themselves, please use those repos' SECURITY.md.
