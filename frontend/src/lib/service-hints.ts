/**
 * Derives the dashboard hint-card label lists from the per-service states.
 * `unreadable` appears in neither list: it has its own hint card, and
 * `connected` appears in neither.
 */

import type { ServiceState } from "./service-state";

export interface ServiceHintInput {
  /** Display label as the user knows the service, e.g. "Deploy Panel". */
  label: string;
  state: ServiceState;
}

export interface ServiceHintLists {
  notConfigured: string[];
  unreachable: string[];
}

export function serviceHintLists(
  services: readonly ServiceHintInput[],
): ServiceHintLists {
  const notConfigured: string[] = [];
  const unreachable: string[] = [];
  for (const service of services) {
    if (service.state === "not_configured") notConfigured.push(service.label);
    else if (service.state === "error") unreachable.push(service.label);
  }
  return { notConfigured, unreachable };
}
