export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Error thrown by {@link apiFetch} on a non-2xx response. Extends `Error` so
 * existing `instanceof Error` / `err.message` call sites keep working, while
 * also carrying the HTTP `status` and parsed response `body` for callers that
 * need to branch on a structured error (e.g. a `multiple_teams` code).
 */
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  /** Seconds until a retry is allowed, from a readable `Retry-After` header (429 only). */
  retryAfterSeconds?: number;
  constructor(message: string, status: number, body: Record<string, unknown>, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

const RATE_LIMIT_FALLBACK_MESSAGE = "Too many requests, try again later.";
/** Longest wait shown to the user; a larger header value is displayed as this cap. */
const MAX_RETRY_DISPLAY_SECONDS = 3600;

/**
 * Parse a `Retry-After` value (delay-seconds or an HTTP date) into whole
 * seconds, rounded up and capped. Returns undefined when the header is absent,
 * invalid, or already due.
 */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  let seconds: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    seconds = Number(trimmed);
  } else {
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return undefined;
    seconds = (at - Date.now()) / 1000;
  }
  const rounded = Math.ceil(seconds);
  if (rounded <= 0) return undefined;
  return Math.min(rounded, MAX_RETRY_DISPLAY_SECONDS);
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    // Merge headers last so caller options.headers layer ON TOP of the
    // defaults rather than replacing the whole headers key. A caller can
    // still intentionally override Content-Type by passing it in headers.
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Pilot's proxy routes wrap upstream errors as { error: "..." };
    // some backends use { message: "..." }. Fall back in that order so
    // actionable server messages (e.g. "Connect your GitHub account")
    // reach the UI instead of a generic "API error: 403".
    if (res.status === 429) {
      // The limiter answers { error: "rate_limited", message: "..." }: the
      // human text is the message, not the machine code. Retry-After is only
      // readable same-origin (CORS exposes no headers), so it may be absent.
      const text =
        typeof body.message === "string" && body.message.trim() !== ""
          ? body.message
          : RATE_LIMIT_FALLBACK_MESSAGE;
      const retryAfter = parseRetryAfter(res.headers?.get("Retry-After"));
      throw new ApiError(
        retryAfter === undefined ? text : `${text} Try again in ${retryAfter} s.`,
        res.status,
        body,
        retryAfter,
      );
    }
    throw new ApiError(body.error || body.message || `API error: ${res.status}`, res.status, body);
  }

  return res.json();
}
