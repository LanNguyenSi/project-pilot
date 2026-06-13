/**
 * GitHub OAuth routes — identity-broker entry point.
 *
 *   GET /api/oauth/github/start     — redirect to GitHub with CSRF state
 *   GET /api/oauth/github/callback  — verify code, upsert user, orchestrate
 *                                     module registration, set session cookie
 *
 * project-pilot is only an identity broker: after the callback completes we
 * never persist the GitHub access-token. Downstream modules each receive the
 * token, re-verify it against GitHub themselves, and hand back their own
 * API tokens which we then store encrypted.
 */
import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { config, hasGitHubOAuthConfigured } from "../config/index.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  fetchPrimaryVerifiedEmail,
  generateState,
  type OAuthConfig,
} from "../services/github-oauth.js";
import { prisma } from "../lib/prisma.js";
import { generateSessionToken, hashToken } from "../services/auth.js";
import { registerUserWithAllModules } from "../services/module-registration.js";
import type { AppEnv } from "../types/hono.js";

const oauth = new Hono<AppEnv>();

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // mirrors the email/password session
const OAUTH_STATE_COOKIE = "oauth_state";
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes

function oauthRedirectUri(): string {
  return `${config.BACKEND_URL.replace(/\/+$/, "")}/api/oauth/github/callback`;
}

function buildOAuthConfig(): OAuthConfig | null {
  if (!hasGitHubOAuthConfigured) return null;
  return {
    clientId: config.GITHUB_CLIENT_ID!,
    clientSecret: config.GITHUB_CLIENT_SECRET!,
    redirectUri: oauthRedirectUri(),
  };
}

async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await prisma.session.create({
    data: { tokenHash, userId, expiresAt },
  });
  return token;
}

oauth.get("/github/start", (c) => {
  const cfg = buildOAuthConfig();
  if (!cfg) {
    return c.json(
      {
        error: "not_configured",
        message: "GitHub OAuth is not configured on this instance",
      },
      503,
    );
  }

  const state = generateState();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE,
  });

  return c.redirect(buildAuthorizationUrl(cfg, state));
});

oauth.get("/github/callback", async (c) => {
  const cfg = buildOAuthConfig();
  if (!cfg) {
    return c.json({ error: "not_configured" }, 503);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, OAUTH_STATE_COOKIE);

  // Always clear the transient state cookie, regardless of outcome.
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

  if (!code) {
    return c.redirect(`${config.FRONTEND_URL}/auth/error?reason=missing_code`);
  }
  if (!state || !storedState || state !== storedState) {
    return c.redirect(`${config.FRONTEND_URL}/auth/error?reason=state_mismatch`);
  }

  let tokenResponse;
  let githubUser;
  let verifiedEmail;
  try {
    tokenResponse = await exchangeCodeForToken(cfg, code);
    githubUser = await fetchGitHubUser(tokenResponse.access_token);
    verifiedEmail = await fetchPrimaryVerifiedEmail(tokenResponse.access_token);
  } catch (err) {
    console.error("OAuth exchange failed:", (err as Error).message);
    return c.redirect(`${config.FRONTEND_URL}/auth/error?reason=oauth_failed`);
  }

  const githubId = String(githubUser.id);
  // Use the primary VERIFIED email as the identity merge key. The public
  // profile email is unverified and attacker-controllable, so it must never
  // be allowed to match an existing account. If GitHub returns no verified
  // primary, email is null and the user is handled by the githubId create path.
  const email = verifiedEmail;

  let user = await prisma.user.findUnique({ where: { githubId } });

  // Email-collision handling: refuse to hijack a locally-registered account.
  // If an existing user matches by email but has a passwordHash and no
  // githubId, they registered locally first. Silently merging would let
  // anyone who happens to control that GitHub email take over the account.
  // Require the user to sign in with their password first and link GitHub
  // explicitly (follow-up task tracks the linking UI).
  if (!user && email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Never claim a row already linked to a DIFFERENT GitHub identity.
      // The githubId lookup above missed (this incoming id is new), so a
      // non-null, mismatching githubId means the email belongs to a distinct
      // GitHub account — auto-merging would let a second GitHub identity that
      // happens to share the verified email take over the first one's account.
      if (byEmail.githubId && byEmail.githubId !== githubId) {
        return c.redirect(
          `${config.FRONTEND_URL}/auth/error?reason=email_collision`,
        );
      }
      if (byEmail.passwordHash && !byEmail.githubId) {
        return c.redirect(
          `${config.FRONTEND_URL}/auth/error?reason=email_collision`,
        );
      }
      user = byEmail;
    }
  }

  // Resolve a safe email for the write. The collision block above only guards
  // the create path (!user). When an existing githubId row is matched, writing
  // a verified email that ANOTHER row already owns would violate the `email`
  // @unique constraint and surface as a raw 500. Keep the matched row's current
  // email in that case rather than hijacking the other account or erroring.
  let resolvedEmail = email ?? user?.email ?? null;
  if (resolvedEmail && user && resolvedEmail !== user.email) {
    const emailOwner = await prisma.user.findUnique({ where: { email: resolvedEmail } });
    if (emailOwner && emailOwner.id !== user.id) {
      resolvedEmail = user.email ?? null;
    }
  }

  const userData = {
    githubId,
    githubLogin: githubUser.login,
    avatarUrl: githubUser.avatar_url,
    name: githubUser.name ?? user?.name ?? null,
    email: resolvedEmail,
  };

  try {
    if (user) {
      user = await prisma.user.update({ where: { id: user.id }, data: userData });
    } else {
      user = await prisma.user.create({ data: userData });
    }
  } catch (err) {
    // Defense in depth: never let a DB error (e.g. an unforeseen unique
    // collision) surface as a raw 500 from the OAuth callback.
    console.error("OAuth user upsert failed:", err);
    return c.redirect(`${config.FRONTEND_URL}/auth/error?reason=server_error`);
  }

  // Kick off module registration in parallel. We do NOT block on full success
  // — if a module is down we still sign the user in. The /settings UI can
  // retry per-module later. The access-token is used here once and then
  // discarded (never persisted in project-pilot).
  try {
    const results = await registerUserWithAllModules(
      user.id,
      tokenResponse.access_token,
      githubUser.login,
    );
    const failed = results.filter((r) => !r.ok).map((r) => r.service);
    if (failed.length > 0) {
      console.warn(
        `[oauth] module registration partial: user=${user.id} failed=${failed.join(",")}`,
      );
    }
  } catch (err) {
    // Registration orchestrator shouldn't throw — this is defensive.
    console.error("module registration orchestrator threw:", (err as Error).message);
  }

  let sessionToken: string;
  try {
    sessionToken = await createSession(user.id);
  } catch (err) {
    console.error("OAuth session create failed:", err);
    return c.redirect(`${config.FRONTEND_URL}/auth/error?reason=server_error`);
  }
  // SameSite=Lax on the OAuth-issued session cookie so the browser sends it
  // on the top-level navigation back to the frontend after this callback's
  // 302 redirect. The email/password flow uses Strict because it's entirely
  // same-origin API-driven; OAuth's callback is a cross-site navigation, so
  // Strict would leave the user logged out on /dashboard. Lax still blocks
  // CSRF-relevant cross-site POSTs.
  setCookie(c, "session", sessionToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return c.redirect(`${config.FRONTEND_URL}/dashboard`);
});

export { oauth };
