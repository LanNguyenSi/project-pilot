/**
 * GitHub OAuth service
 *
 * Handles the GitHub OAuth2 flow for project-pilot:
 *   1. Build the authorization URL (with state)
 *   2. Exchange authorization code for access token
 *   3. Fetch the authenticated GitHub user
 *
 * We only need the access-token briefly — long enough to verify identity and
 * hand it to each downstream module's `register-from-project-pilot` endpoint.
 * It is NOT persisted in project-pilot's database.
 */

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Scopes: read:user / read:org for identity, repo so downstream modules can
// use the same token for their own GitHub reads (agent-tasks' project sync).
// workflow is required on top of repo so the token can push scaffolds that
// contain .github/workflows/* — GitHub rejects an OAuth App pushing workflow
// files without it (project-forge publish creates a CI workflow).
const OAUTH_SCOPES = "read:user read:org repo workflow";

export function buildAuthorizationUrl(cfg: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: OAUTH_SCOPES,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  cfg: OAuthConfig,
  code: string,
): Promise<GitHubTokenResponse> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as GitHubTokenResponse & { error?: string };
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error}`);
  }
  return data;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Fetch the user's primary, verified email address from GitHub.
 *
 * The public profile email (`GitHubUser.email`) is unverified and can be set
 * to an arbitrary address, so it must never be used as an identity merge key.
 * This reads GET /user/emails (permitted by the existing read:user scope) and
 * returns only the entry that is BOTH primary and verified, lower-cased. If no
 * such entry exists, returns null and the caller falls back to the githubId
 * create path.
 */
export async function fetchPrimaryVerifiedEmail(
  accessToken: string,
): Promise<string | null> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub email fetch failed: ${response.status}`);
  }

  const emails = (await response.json()) as GitHubEmail[];
  const match = emails.find((e) => e.primary && e.verified);
  return match ? match.email.toLowerCase() : null;
}

export function generateState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
