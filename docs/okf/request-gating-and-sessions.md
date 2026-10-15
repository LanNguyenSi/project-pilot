---
type: invariant
title: Request gating and session model
description: Global CORS and security headers, CSRF registered per route prefix in app.ts, requireAuth registered per router, opaque hashed session tokens with SameSite Strict for password sign-in and Lax for GitHub sign-in, per-process rate limits on four public auth endpoints keyed on the last X-Forwarded-For entry, and a CSP that only the frontend sets.
tags: [auth, sessions, csrf, cors, rate-limit, headers, csp]
timestamp: 2026-10-15T12:25:25Z
sources:
  - backend/src/app.ts
  - backend/src/middleware/auth.ts
  - backend/src/middleware/csrf.ts
  - backend/src/middleware/cors.ts
  - backend/src/middleware/rate-limit.ts
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
- Rate limits exist only on the public auth endpoints, and their client
  address is correct only behind exactly one reverse proxy that appends to
  `X-Forwarded-For`.
- The Content-Security-Policy comes from the frontend; the backend sends
  none.

## Middleware order

`app.ts` registers CORS and the security headers for every path, then the
CSRF middleware for six prefixes: `/api/auth`, `/api/credentials`,
`/api/dashboard`, `/api/forge`, `/api/tasks` and `/api/deploy`
(`backend/src/app.ts:38-50#"/api/deploy/*"`). `/api/oauth/*` is left out on
purpose: it is GET-only, and its CSRF defense is the OAuth state cookie
(`backend/src/app.ts:41-45#"CSRF defense for this flow."`). The routers are
mounted afterwards (`backend/src/app.ts:52-59#", deploy);"`).

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
`backend/src/routes/credentials.ts:12#"credentials.use("`,
`backend/src/routes/dashboard.ts:20#"dashboard.use("`,
`backend/src/routes/forge.ts:18#"forge.use("`,
`backend/src/routes/tasks.ts:38#"tasks.use("`, and
`backend/src/routes/deploy.ts:82#"deploy.use("`. In the auth router only
`GET /api/auth/me` is protected
(`backend/src/routes/auth.ts:103#"auth.get("`). `GET /api/health` has no
check (`backend/src/routes/health.ts:7#"health.get("`), and neither do the
two OAuth routes.

## Session model

A session token is 32 random bytes, hex-encoded
(`backend/src/services/auth.ts:44-45#"randomBytes(32).toString("`), and the
`Session` row stores its SHA-256 hash
(`backend/src/services/auth.ts:48-49#"update(token)"`). Password sign-in and
GitHub sign-in create the row the same way, with a 30-day expiry
(`backend/src/routes/auth.ts:51-57#"data: { tokenHash, userId, expiresAt },"`,
`backend/src/routes/oauth.ts:48-55#"return token;"`). The expiry is fixed at
creation; `requireAuth` does not extend it.

The two flows differ in the cookie's `SameSite` attribute:

- Register and login set `SameSite=Strict`
  (`backend/src/routes/auth.ts:41-47#"maxAge: SESSION_MAX_AGE,"`).
- The GitHub callback sets `SameSite=Lax`, because the browser reaches the
  frontend through a cross-site redirect chain that a Strict cookie would not
  survive (`backend/src/routes/oauth.ts:213-224#"maxAge: SESSION_MAX_AGE,"`).

Both cookies are `httpOnly`, and `Secure` only when `NODE_ENV` is
`production`. The comment on the CSRF middleware names both settings, Strict for password
login and Lax for GitHub sign-in
(`backend/src/middleware/csrf.ts:5-7#"sign-in), this provides double protection."`).

A session ends when it expires, on logout, which deletes the row and clears
the cookie (`backend/src/routes/auth.ts:92-98#"deleteCookie(c, "`), or on a
password reset, which deletes every session of that user
(`backend/src/routes/auth.ts:165-168#"prisma.session.deleteMany({ where: { userId: reset.userId } }),"`).

The OAuth `state` cookie is separate: Lax, ten minutes
(`backend/src/routes/oauth.ts:70-77#"maxAge: STATE_COOKIE_MAX_AGE,"`), always
cleared in the callback, and compared with the `state` query parameter
(`backend/src/routes/oauth.ts:92-100#"state_mismatch"`).

## CSRF header check

For any method other than GET, HEAD and OPTIONS, `csrfProtection` requires
`X-Requested-With: XMLHttpRequest` and otherwise answers 403 `csrf_failed`
(`backend/src/middleware/csrf.ts:17-18#"requested !== "`). The check does not
look at cookies, so it applies the same way to Strict and Lax sessions. The
frontend's `apiFetch` sends the header on every call, together with
`credentials: "include"`
(`frontend/src/lib/api.ts:24-32#"X-Requested-With"`).

## Rate limits

Only four routes are limited, each per minute:

- register, 5 (`backend/src/routes/auth.ts:64#"rateLimit({ max: 5, windowMs: 60_000 })"`),
- login, 10, also per email (`backend/src/routes/auth.ts:78#"keyGenerator: emailKey"`),
- forgot-password, 3, also per email (`backend/src/routes/auth.ts:115#"max: 3"`),
- reset-password, 5 (`backend/src/routes/auth.ts:149#"rateLimit({ max: 5, windowMs: 60_000 })"`).

The limiter counts one bucket per client address and path
(`backend/src/middleware/rate-limit.ts:74#"ip:${ip}:${c.req.path}"`) and,
when a key generator is set, a second bucket per identity and path
(`backend/src/middleware/rate-limit.ts:81#"id:${extra}:${c.req.path}"`). The
email key is read from the cached request body and normalized to lower case
(`backend/src/routes/auth.ts:21-24#"body.email.toLowerCase().trim()"`). A
breach answers 429 with `Retry-After`
(`backend/src/middleware/rate-limit.ts:87-92#"429,"`).

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
(`frontend/next.config.ts:24-27#"Content-Security-Policy"`). Its `frame-src`
lists the module origins pilot embeds as iframes, built from
`NEXT_PUBLIC_DEPSIGHT_URL` (`frontend/next.config.ts:7-9#"].join("`), and
`frame-ancestors 'none'` forbids framing pilot itself
(`frontend/next.config.ts:18-19#"frame-ancestors 'none'"`). A new embedded
module has to be added to that list
(`frontend/next.config.ts:3-6#"to forbid anyone else from framing project-pilot."`).

## What breaks these invariants

- A router mounted in `app.ts` without its own `requireAuth` is public; one
  without a matching `csrfProtection` prefix skips the header check on its
  writes.
- Replacing the hashed token with a signed or stored-plain value changes
  what a database leak exposes.
- Deploying the backend without a proxy, or behind two, changes what the
  rate limiter counts.
