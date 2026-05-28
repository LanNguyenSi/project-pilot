const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Error thrown by {@link apiFetch} on a non-2xx response. Extends `Error` so
 * existing `instanceof Error` / `err.message` call sites keep working, while
 * also carrying the HTTP `status` and parsed response `body` for callers that
 * need to branch on a structured error (e.g. a `multiple_teams` code).
 */
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Pilot's proxy routes wrap upstream errors as { error: "..." };
    // some backends use { message: "..." }. Fall back in that order so
    // actionable server messages (e.g. "Connect your GitHub account")
    // reach the UI instead of a generic "API error: 403".
    throw new ApiError(body.error || body.message || `API error: ${res.status}`, res.status, body);
  }

  return res.json();
}
