---
type: invariant
title: Credential and identity trust boundaries
description: SESSION_SECRET is the only key material for stored service credentials and nothing else reads it; the GitHub access token is used for sign-in, forwarded once to the three module hosts and never stored; a failed module registration still signs the user in; the MCP server never touches the credential store.
tags: [credentials, encryption, oauth, identity, mcp]
timestamp: 2026-10-15T04:19:15Z
sources:
  - backend/src/lib/crypto.ts
  - backend/src/config/index.ts
  - backend/src/services/auth.ts
  - backend/src/services/credentials.ts
  - backend/src/routes/credentials.ts
  - backend/src/services/downstream.ts
  - backend/src/services/agent-tasks-client.ts
  - backend/src/routes/forge.ts
  - backend/src/routes/deploy.ts
  - backend/src/app.ts
  - backend/src/routes/oauth.ts
  - backend/src/services/github-oauth.ts
  - backend/src/services/module-registration.ts
  - backend/prisma/schema.prisma
  - mcp/src/config.ts
  - mcp/src/client.ts
---

# Credential and identity trust boundaries

project-pilot holds two kinds of secrets with different lifetimes: the
per-user API tokens for project-forge, agent-tasks and deploy-panel, stored
encrypted in the `ServiceCredential` table, and a user's GitHub access token,
which exists only for the duration of one OAuth callback. The MCP server is a
third, separate trust domain with its own keys.

## The invariants

- `SESSION_SECRET` is the root of every stored credential's encryption key,
  and nothing else in the backend reads it. Sessions do not use it.
- Rotating `SESSION_SECRET` makes every stored credential unreadable; it does
  not end any session.
- The GitHub access token is never written to the database. After the
  callback has used it to identify the user, it is sent once to each of the
  three module hosts and then dropped.
- A module registration that fails does not block sign-in.
- The MCP server (`mcp/`) reads its keys from its own environment and never
  reads the backend database or `SESSION_SECRET`.

## Stored credentials: one key root

`deriveKey` runs scrypt over `config.SESSION_SECRET` with a per-ciphertext
salt (`backend/src/lib/crypto.ts:15#"scryptSync(config.SESSION_SECRET, salt, 32)"`).
`encrypt` draws a fresh salt and IV for every call and stores AES-256-GCM
output as `salt:iv:tag:ciphertext`
(`backend/src/lib/crypto.ts:21-24#"const iv = randomBytes(IV_LENGTH);"`).
The config schema only requires the secret to be at least 16 characters
(`backend/src/config/index.ts:5#"SESSION_SECRET: z.string().min(16),"`).

Despite its name, the value plays no part in sessions. A session token is 32
random bytes (`backend/src/services/auth.ts:44-45#"randomBytes(32).toString("`),
and only its SHA-256 hash is stored and looked up
(`backend/src/services/auth.ts:48-49#"update(token)"`). See
[request gating and sessions](request-gating-and-sessions.md) for the session
model.

`upsertCredential` encrypts before every write
(`backend/src/services/credentials.ts:32-38#"update: { token: encrypted, label },"`),
and the column holds only ciphertext
(`backend/prisma/schema.prisma:92-97#"// encrypted"`). `getCredential` is the
only decrypting reader
(`backend/src/services/credentials.ts:43-50#"return decrypt(cred.token);"`).

### What a `SESSION_SECRET` rotation does

`decrypt` derives the key from the current secret, so a ciphertext written
under the old one fails the GCM tag check and throws
(`backend/src/lib/crypto.ts:48-52#"decrypted += decipher.final("`).
`getCredential` catches that error and throws `CredentialUnreadableError`
instead
(`backend/src/services/credentials.ts:49-53#"throw new CredentialUnreadableError(service);"`),
and its callers call it before their own `try` blocks:

- `POST /api/credentials/validate`, which catches the error itself and answers
  `{ valid: false }` with the re-enter message
  (`backend/src/routes/credentials.ts:76-80#"return c.json({ valid: false, error: err.message });"`),
- `callService` behind the dashboard summary
  (`backend/src/services/downstream.ts:22-27#"const token = await getCredential(userId, service);"`),
- `agentTasksRequest`, used by the `/api/tasks` proxy and the forge task
  migration (`backend/src/services/agent-tasks-client.ts:16-21#"getCredential(userId, "`),
- `forgeRequest` in the forge proxy
  (`backend/src/routes/forge.ts:24-25#"getCredential(userId, "`),
- `deployRequest` in the deploy proxy
  (`backend/src/routes/deploy.ts:86-87#"getCredential(userId, "`),
- the `probe-vps` and `install-relay` handlers of the deploy proxy, which call
  it directly before forwarding
  (`backend/src/routes/deploy.ts:256#"getCredential(userId, "`,
  `backend/src/routes/deploy.ts:288#"getCredential(userId, "`).

Every other caller lets the error reach `app.onError`, which answers 409 with
code `credential_unreadable` and the message "Re-enter it in /settings"
(`backend/src/app.ts:24-25#"code: err.code"`); any other error still becomes
a 500 with a generic message
(`backend/src/app.ts:19-30#"Internal server error"`). Listing and deleting
credentials keep working, because neither decrypts the token
(`backend/src/services/credentials.ts:56-59#"select: { id: true, service: true, label: true, updatedAt: true },"`,
`backend/src/services/credentials.ts:64-66#"where: { userId_service: { userId, service } },"`).
A new `PUT /api/credentials`, or a successful module registration on the next
GitHub sign-in, overwrites the row with a ciphertext under the current
secret. Sessions are unaffected, because they never involved the secret.

## The GitHub access token: used, forwarded, dropped

The module header states the contract: project-pilot is an identity broker,
never persists the GitHub token, and stores only the module tokens it gets
back (`backend/src/routes/oauth.ts:8-11#"API tokens which we then store encrypted."`).

1. The callback exchanges the code and uses the token to read the GitHub user
   and the primary verified email
   (`backend/src/routes/oauth.ts:105-108#"fetchPrimaryVerifiedEmail(tokenResponse.access_token);"`).
   The token carries the scopes `read:user user:email read:org repo workflow`
   (`backend/src/services/github-oauth.ts:40#"read:user user:email read:org repo workflow"`).
2. The user row receives identity fields only, no token
   (`backend/src/routes/oauth.ts:164-170#"email: resolvedEmail,"`).
3. `registerUserWithAllModules` gets the token
   (`backend/src/routes/oauth.ts:189-193#"githubUser.login,"`) and posts it in
   the request body to `/api/auth/register-from-project-pilot`
   (`backend/src/services/module-registration.ts:23#"/api/auth/register-from-project-pilot"`)
   on all three modules in parallel
   (`backend/src/services/module-registration.ts:97-99#"registerWithModule(service, SERVICE_URLS[service], userId, payload),"`).
4. Each module answers with its own `apiToken`, which is stored through
   `upsertCredential`
   (`backend/src/services/module-registration.ts:80#"await upsertCredential(userId, service, body.apiToken"`).

The three target hosts come from `PROJECT_FORGE_URL`, `AGENT_TASKS_URL` and
`DEPLOY_PANEL_URL`
(`backend/src/services/module-registration.ts:17-21#"config.DEPLOY_PANEL_URL,"`),
which default to the public opentriologue hosts
(`backend/src/config/index.ts:18-26#"deploy-panel.opentriologue.ai"`). These
variables therefore decide who receives every signing-in user's GitHub token
with the scopes above. A module error is mapped to a status code only,
without echoing the response body
(`backend/src/services/module-registration.ts:63-66#"ok: false, error:"`).

### Identity matching

The callback first looks the user up by `githubId`
(`backend/src/routes/oauth.ts:121#"where: { githubId }"`). Only when that
misses does it fall back to the primary verified email, which
`fetchPrimaryVerifiedEmail` returns lower-cased or as null
(`backend/src/services/github-oauth.ts:127-129#"match.email.toLowerCase()"`).
An email match is refused with `email_collision` when that row is already
linked to a different `githubId` or is a password account without a
`githubId`
(`backend/src/routes/oauth.ts:129-147#"user = byEmail;"`).

### Partial registration still signs the user in

`registerWithModule` turns an unreachable host, a non-2xx answer, an
unparsable body or a missing `apiToken` into an `ok: false` result, and the
callback only logs the failed services. A thrown error from the orchestrator
is caught and logged as well
(`backend/src/routes/oauth.ts:195-203#"module registration orchestrator threw"`).
The session is created afterwards, whatever the registration outcome
(`backend/src/routes/oauth.ts:206-208#"sessionToken = await createSession(user.id);"`).
The `upsertCredential` call is the one step inside `registerWithModule`
without its own error handling, so a database error there rejects the whole
`Promise.all`; tokens already stored for the other modules stay stored, and
the user is still signed in. A failed registration stores no new credential
for that module and leaves an earlier one in place: every `ok: false` return
comes before the only write
(`backend/src/services/module-registration.ts:60-77#"no_token_in_response"`),
and that write is an upsert keyed on user and service
(`backend/src/services/credentials.ts:35-38#"update: { token: encrypted, label },"`).
A user with no earlier credential for that module therefore has none until
they paste a token in `/settings` or sign in with GitHub again; a user who
already has one keeps it.

## The MCP server is a separate trust domain

`loadConfig` reads `FORGE_API_KEY`, `TASKS_TOKEN` and `DEPLOY_API_KEY` from
the environment and exits when one is missing
(`mcp/src/config.ts:10-24#"process.exit(1);"`). The target URLs come from
`FORGE_URL`, `TASKS_URL` and `DEPLOY_URL`
(`mcp/src/config.ts:26-32#"deployApiKey,"`). `PilotClient` sends the forge key
as `X-API-Key` and the other two as Bearer tokens
(`mcp/src/client.ts:12-21#"this.config.deployApiKey"`). Nothing under
`mcp/src` imports backend code, Prisma or `SESSION_SECRET`, so tokens a user
stored in the web UI are not available to MCP clients, and keys given to the
MCP server never reach the database.

## What breaks these invariants

- Reading `SESSION_SECRET` anywhere else (for example to sign cookies) would
  tie session lifetime to credential readability, and a rotation would then
  end sessions as well.
- Adding a token column to `User`, or logging `tokenResponse`, would persist
  the GitHub token that the broker design keeps transient.
- Pointing a module URL variable at an untrusted host hands that host the
  GitHub token of every user who signs in.
