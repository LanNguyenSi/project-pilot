import { config } from "../config/index.js";
import { getCredential } from "./credentials.js";
import { isUpstreamTimeout } from "../lib/upstream-timeout.js";

export type AgentTasksResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const TASKS_URL = config.AGENT_TASKS_URL;

/**
 * Thin Bearer-authenticated proxy to the agent-tasks REST API on behalf of a
 * pilot user. Shared by the `/api/tasks` proxy routes and the forge→tasks
 * migration service so the auth + error handling lives in one place.
 */
export async function agentTasksRequest<T>(
  userId: string,
  path: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<AgentTasksResult<T>> {
  const token = await getCredential(userId, "agent-tasks");
  if (!token) {
    return { ok: false, error: "Agent Tasks not configured. Add your token in Settings.", status: 400 };
  }

  const { timeoutMs = 10_000, ...fetchOptions } = options ?? {};

  try {
    const res = await fetch(`${TASKS_URL}${path}`, {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = (await res.json()) as T;
    if (!res.ok) {
      return {
        ok: false,
        error: (body as any).error || (body as any).message || `API error: ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, data: body };
  } catch (err) {
    if (isUpstreamTimeout(err)) {
      return { ok: false, error: "Agent Tasks timed out", status: 504 };
    }
    return { ok: false, error: "Agent Tasks unreachable", status: 502 };
  }
}
