---
type: invariant
title: Request gating and session model
description: Global CORS and security headers, CSRF registered per route prefix in app.ts, requireAuth registered per router, opaque hashed session tokens with SameSite Strict for password sign-in and Lax for GitHub sign-in, per-process rate limits on four public auth endpoints, the credential write, the forge magic-fill proxy and five expensive proxy routes keyed on the last X-Forwarded-For entry, and a CSP that only the frontend sets.
tags: [auth, sessions, csrf, cors, rate-limit, headers, csp]
timestamp: 2026-11-24T10:37:03Z
sources:
  - backend/src/app.ts
  - backend/src/middleware/auth.ts
  - backend/src/middleware/csrf.ts
  - backend/src/middleware/cors.ts
  - backend/src/middleware/rate-limit.ts
  - backend/src/middleware/rate-limit-keys.ts
  - backend/src/middleware/security.ts
  - backend/src/routes/auth.ts
  - backend/src/routes/oauth.ts
  - backend/src/routes/health.ts
  - backend/src/routes/credentials.ts
  - backend/src/routes/dashboard.ts
  - backend/src/routes/forge.ts
  - backend/src/routes/tasks.ts
  - backend/src/routes/deploy.ts
  - backend/src/services/auth.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/csp.ts
  - frontend/next.config.ts
---

# Request gating and session model

Every backend request passes the same global middleware, then, for six
route prefixes, a CSRF check registered in `app.ts`, then whatever the
mounted router adds itself. Authentication is not global: each router opts
in. This doc records which layer owns which check, so a new route group gets
all of them.

## The invariants

- CSRF protection is registered by path prefix in `backend/src/app.ts`;
  authentication is registered inside each router. A new route group needs
  both registrations, in two different files.
- A session is an opaque random token. The server stores only its SHA-256
  hash, and nothing about it is signed.
- Rate limits exist only on the four public auth endpoints, the credential
  write, the forge magic-fill proxy and the five expensive proxy routes
  (deploy probe-vps and install-relay, team sync, forge generate and
  publish), and their client address is correct only behind exactly one
  reverse proxy that appends to `X-Forwarded-For`.
- The Content-Security-Policy comes from the frontend; the backend sends
  none.

## Middleware order

`app.ts` registers CORS and the security headers for every path, then a
global request body cap of 128 KiB (413 `{"error":"Payload too large"}`,
counted as the body streams in when there is no `Content-Length`), so it runs
before CSRF, the rate-limit key generators and every route, then the CSRF
middleware for six prefixes: `/api/auth`, `/api/credentials`,
`/api/dashboard`, `/api/forge`, `/api/tasks` and `/api/deploy`
(`backend/src/app.ts:39-54#"/api/deploy/*"`). `/api/oauth/*` is left out on
purpose: it is GET-only, and its CSRF defense is the OAuth state cookie
(`backend/src/app.ts:45-49#"CSRF defense for this flow."`). The routers are
mounted afterwards (`backend/src/app.ts:56-63#", deploy);"`).

- CORS allows only the comma-separated `CORS_ORIGINS`, with credentials and
  the `X-Requested-With` header
  (`backend/src/middleware/cors.ts:4-8#"allowMethods"`).
- `securityHeaders` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`
  and `Referrer-Policy` after the handler ran, plus HSTS when `NODE_ENV` is
  `production` (`backend/src/middleware/security.ts:5-11#"Strict-Transport-Security"`).

## Authentication is per router

`requireAuth` reads the `session` cookie, hashes it, and looks the hash up. A
missing or expired session returns 401; an expired row is deleted and the
cookie cleared (`backend/src/middleware/auth.ts:7-26#"Session expired"`). On
success it sets `userId` on the context
(`backend/src/middleware/auth.ts:28#"session.user.id"`).

Each protected router registers it itself:
`backend/src/routes/credentials.ts:14#"credentials.use("`,
`backend/src/routes/dashboard.ts:20#"dashboard.use("`,
`backend/src/routes/forge.ts:20#"forge.use("`,
`backend/src/routes/tasks.ts:40#"tasks.use("`, and
`backend/src/routes/deploy.ts:84#"deploy.use("`. In the auth router only
`GET /api/auth/me` is protected
(`backend/src/routes/auth.ts:133#"auth.get("`). `GET /api/health` has no
check (`backend/src/routes/health.ts:7#"health.get("`), and neither do the
two OAuth routes.

## Session model

A session token is 32 random bytes, hex-encoded
(`backend/src/services/auth.ts:96-97#"randomBytes(32).toString("`), and the
`Session` row stores its SHA-256 hash
(`backend/src/services/auth.ts:100-101#"update(token)"`). Password sign-in and
GitHub sign-in create the row the same way, with a 30-day expiry
(`backend/src/routes/auth.ts:51-57#"data: { tokenHash, userId, expiresAt },"`,
`backend/src/routes/oauth.ts:50-57#"return token;"`). The expiry is fixed at
creation; `requireAuth` does not extend it.

The two flows differ in the cookie's `SameSite` attribute:

- Login and the bootstrap-only register (closed with 403 unless
  `ALLOW_FIRST_PASSWORD_ACCOUNT=true` and no user exists) set `SameSite=Strict`
  (`backend/src/routes/auth.ts:41-47#"maxAge: SESSION_MAX_AGE,"`). The route's
  count is only the early refusal: `registerUser` counts again inside the create
  transaction behind a transaction-scoped advisory lock, so two concurrent
  bootstrap requests create at most one user and the loser gets the same 403
  (`backend/src/services/auth.ts:48#"pg_advisory_xact_lock"`). The GitHub
  callback creates users without that lock.
- The GitHub callback sets `SameSite=Lax`, because the browser reaches the
  frontend through a cross-site redirect chain that a Strict cookie would not
  survive (`backend/src/routes/oauth.ts:219-230#"maxAge: SESSION_MAX_AGE,"`).

Both cookies are `httpOnly`, and `Secure` only when `NODE_ENV` is
`production`. The comment on the CSRF middleware names both settings, Strict for password
login and Lax for GitHub sign-in
(`backend/src/middleware/csrf.ts:5-7#"sign-in), this provides double protection."`).

A session ends when it expires, on logout, which deletes the row and clears
the cookie (`backend/src/routes/auth.ts:122-128#"deleteCookie(c, "`), or on a
password reset, which deletes every session of that user
(`backend/src/routes/auth.ts:221-225#"prisma.session.deleteMany({ where: { userId: reset.userId } }),"`). A signed-in user can also end every session except
the current one with `POST /auth/sessions/revoke-others`; `GET /auth/sessions`
counts the unexpired ones
(`backend/src/routes/auth.ts:231-253#"return c.json({ ok: true, revoked: count });"`).

The OAuth `state` cookie is separate: Lax, ten minutes
(`backend/src/routes/oauth.ts:76-83#"maxAge: STATE_COOKIE_MAX_AGE,"`), always
cleared in the callback, and compared with the `state` query parameter
(`backend/src/routes/oauth.ts:98-106#"state_mismatch"`).

## CSRF header check

For any method other than GET, HEAD and OPTIONS, `csrfProtection` requires
`X-Requested-With: XMLHttpRequest` and otherwise answers 403 `csrf_failed`
(`backend/src/middleware/csrf.ts:17-18#"requested !== "`). The check does not
look at cookies, so it applies the same way to Strict and Lax sessions. The
frontend's `apiFetch` sends the header on every call, together with
`credentials: "include"`
(`frontend/src/lib/api.ts:53-60#"X-Requested-With"`).

## Rate limits

Eleven routes are limited, each per minute:

- register, 5 (`backend/src/routes/auth.ts:90#"rateLimit({ max: 5, windowMs: 60_000 })"`),
- login, 10, also per email (`backend/src/routes/auth.ts:108#"keyGenerator: emailKey"`),
- forgot-password, 3, also per email (`backend/src/routes/auth.ts:179#"max: 3"`),
- reset-password, 5 (`backend/src/routes/auth.ts:205#"rateLimit({ max: 5, windowMs: 60_000 })"`),
- `PUT /api/credentials`, 10, also per signed-in user id, so an account that
  writes from many addresses is still capped
  (`backend/src/routes/credentials.ts:38#"keyGenerator: userKey"`),
- `POST /api/forge/ai-assist/magic-fill`, 10, also per signed-in user id, so
  one account cannot spend the operator's LLM key from many addresses; the
  cheap `GET /api/forge/ai-assist/capabilities` probe stays unlimited
  (`backend/src/routes/forge.ts:259#"keyGenerator: userKey"`),
- `POST /api/deploy/install-relay`, 3, also per signed-in user id: one call
  streams a deploy-panel relay install that runs SSH on a third-party VPS for
  up to about ten minutes
  (`backend/src/routes/deploy.ts:300#"keyGenerator: userKey"`),
- `POST /api/deploy/probe-vps`, 5, also per signed-in user id: each call
  holds a deploy-panel SSH probe open for up to 45 s
  (`backend/src/routes/deploy.ts:261#"keyGenerator: userKey"`),
- `POST /api/tasks/teams/:teamId/sync`, 3, also per signed-in user id, per
  user across teams: the route pins both keys to the fixed bucket
  `tasks:team-sync`, so the 3 per minute are shared by every team id and path
  variant instead of restarting per team id
  (`backend/src/routes/tasks.ts:93#"tasks:team-sync"`),
- `POST /api/forge/generate`, 5, also per signed-in user id, and
  `POST /api/forge/publish`, 5, also per signed-in user id: both spend the
  operator's AI and GitHub quota on project-forge and hold the request for up
  to 60 s (`backend/src/routes/forge.ts:93#"keyGenerator: userKey"`,
  `backend/src/routes/forge.ts:146#"keyGenerator: userKey"`).

All per-user limits share one `userKey` generator defined once in
`backend/src/middleware/rate-limit-keys.ts`.

The limiter counts one bucket per client address and path
(`backend/src/middleware/rate-limit.ts:85#"ip:${ip}:${scope}"`) and,
when a key generator is set, a second bucket per identity and path
(`backend/src/middleware/rate-limit.ts:92#"id:${extra}:${scope}"`). A route
can pin both keys to one fixed bucket name with the `bucket` option
(`backend/src/middleware/rate-limit.ts:75#"bucket?: string;"`), which
replaces the path so all its variants share one quota; every route that
does not set it keeps the path in both keys. The
email key is read from the cached request body and normalized to lower case
(`backend/src/routes/auth.ts:21-24#"body.email.toLowerCase().trim()"`). A
breach answers 429 with `Retry-After`
(`backend/src/middleware/rate-limit.ts:99-104#"429,"`).

The client address is the last `X-Forwarded-For` entry
(`backend/src/middleware/rate-limit.ts:31-39#"if (last) return last;"`), with
the socket address as the fallback when the header is absent
(`backend/src/middleware/rate-limit.ts:41-42#"getConnInfo(c).remote.address"`).
That is the address a single trusted reverse proxy appends
(`backend/src/middleware/rate-limit.ts:25-26#"appends the real client IP as the LAST entry of X-Forwarded-For"`).
Behind two proxies the last entry is the outer proxy's address, so all
clients share one bucket. The counters live in process memory, so each
backend instance keeps its own
(`backend/src/middleware/rate-limit.ts:9-12#"const store = new Map"`).

## Header split between frontend and backend

The backend sets no `Content-Security-Policy`. The frontend's Next config
sends one on every path
(`frontend/next.config.ts:11-16#"Content-Security-Policy"`). Its
`connect-src` lists `'self'` plus the origin (never a path, never a
wildcard) of `NEXT_PUBLIC_API_URL`, the same value and default
`http://localhost:3001` that `frontend/src/lib/api.ts` calls, so the
browser can reach the API in dev; an unparseable or non-http(s) value adds nothing and
the string is built in a pure function
(`frontend/src/lib/csp.ts:23-27#"DEFAULT_API_URL"`). Its `frame-src`
lists the module origins pilot embeds as iframes, built from
`NEXT_PUBLIC_DEPSIGHT_URL` (`frontend/src/lib/csp.ts:35-37#"].join("`), and
`frame-ancestors 'none'` forbids framing pilot itself
(`frontend/src/lib/csp.ts:52-53#"frame-ancestors 'none'"`). A new embedded
module has to be added to that list
(`frontend/src/lib/csp.ts:4-7#"to forbid anyone else from framing project-pilot."`).

## What breaks these invariants

- A router mounted in `app.ts` without its own `requireAuth` is public; one
  without a matching `csrfProtection` prefix skips the header check on its
  writes.
- Replacing the hashed token with a signed or stored-plain value changes
  what a database leak exposes.
- Deploying the backend without a proxy, or behind two, changes what the
  rate limiter counts.
