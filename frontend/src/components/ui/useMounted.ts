"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during the server render and the hydration pass, true on every client
 * render after that. Same contract as the `useState(false)` + mount-effect
 * pattern it replaces (no hydration mismatch, no `document` access during
 * prerender), without a state update inside an effect.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
