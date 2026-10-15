/**
 * Single source of truth for how a dashboard service status maps to the
 * state a card renders. Pure so the mapping can be unit-tested without
 * rendering components.
 */

export type ServiceState = "connected" | "error" | "not_configured" | "unreadable";

/** The subset of a dashboard service status this mapping reads. */
export interface ServiceStatusLike {
  configured: boolean;
  /** A credential is stored but could not be decrypted (credential_unreadable). */
  unreadable?: boolean;
  error?: string | null;
}

/**
 * `undefined` (summary not loaded yet) counts as not configured. An
 * unreadable credential outranks a downstream error because its data
 * fetches are skipped entirely.
 */
export function serviceState(status: ServiceStatusLike | undefined): ServiceState {
  if (!status || !status.configured) return "not_configured";
  if (status.unreadable) return "unreadable";
  if (status.error) return "error";
  return "connected";
}
