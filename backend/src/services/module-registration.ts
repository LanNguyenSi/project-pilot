/**
 * Module registration orchestrator
 *
 * After a user completes GitHub OAuth, we call each downstream module's
 * `POST /api/auth/register-from-project-pilot` endpoint with the verified
 * GitHub access-token. Each module re-verifies the token against GitHub
 * itself (we do not blindly delegate trust), provisions the user, and
 * returns `{ apiToken, userId, githubLogin }`. We store the apiToken
 * encrypted in ServiceCredential so day-to-day API calls use it.
 *
 * Per-module failures do not abort the whole flow — we surface them so the
 * caller (UI) can prompt a retry for the affected module only.
 */
import { config } from "../config/index.js";
import { upsertCredential, type ServiceName } from "./credentials.js";

const SERVICE_URLS: Record<ServiceName, string> = {
  "project-forge": config.PROJECT_FORGE_URL,
  "agent-tasks": config.AGENT_TASKS_URL,
  "deploy-panel": config.DEPLOY_PANEL_URL,
};

const REGISTER_PATH = "/api/auth/register-from-project-pilot";
const REQUEST_TIMEOUT_MS = 10_000;

export interface ModuleRegistrationResult {
  service: ServiceName;
  ok: boolean;
  error?: string;
}

interface RegisterResponseBody {
  apiToken: string;
  userId: string;
  githubLogin: string;
}

/**
 * Register the user with one module. Idempotent from the module's side —
 * repeat calls for the same GitHub identity upsert rather than duplicate.
 */
async function registerWithModule(
  service: ServiceName,
  baseUrl: string,
  userId: string,
  payload: { githubAccessToken: string; githubLogin: string },
): Promise<ModuleRegistrationResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${REGISTER_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { service, ok: false, error: "unreachable" };
  }

  if (!response.ok) {
    // Map the module's response to an actionable error code, but don't echo
    // any body that could contain the access-token or sensitive headers.
    return { service, ok: false, error: `http_${response.status}` };
  }

  let body: RegisterResponseBody;
  try {
    body = (await response.json()) as RegisterResponseBody;
  } catch {
    return { service, ok: false, error: "invalid_response" };
  }

  if (!body.apiToken) {
    return { service, ok: false, error: "no_token_in_response" };
  }

  await upsertCredential(userId, service, body.apiToken, `GitHub: ${body.githubLogin}`);
  return { service, ok: true };
}

/**
 * Orchestrate registration across all configured modules. Each module's
 * result is independent — one failing module never blocks another from
 * succeeding.
 */
export async function registerUserWithAllModules(
  userId: string,
  githubAccessToken: string,
  githubLogin: string,
): Promise<ModuleRegistrationResult[]> {
  const services: ServiceName[] = ["project-forge", "agent-tasks", "deploy-panel"];
  const payload = { githubAccessToken, githubLogin };

  return Promise.all(
    services.map((service) =>
      registerWithModule(service, SERVICE_URLS[service], userId, payload),
    ),
  );
}
