/**
 * True when `err` is the DOMException a `fetch()` call rejects with when its
 * `AbortSignal.timeout()` signal fires.
 *
 * Node's AbortSignal.timeout() rejects with a DOMException named
 * "TimeoutError" (not "AbortError", which is reserved for an explicit
 * abort() call on an AbortController). Match both so a slow upstream is
 * reported as a timeout (its own status/message) instead of falling through
 * to a generic "unreachable" error. The AbortError arm is defensive only:
 * none of today's callers combine AbortSignal.timeout() with a
 * caller-supplied AbortController, so in practice only TimeoutError fires.
 *
 * Do not use at a site where the caller supplies its own signal: there an
 * AbortError means the client hung up and must not be reported as an
 * upstream timeout (see deploy.ts install-relay, which maps it to 499).
 */
export function isUpstreamTimeout(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}
