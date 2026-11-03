"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Whether the backend has GitHub OAuth configured. Fails closed: false while
 * loading and when the request fails, so the login page never offers a button
 * that leads to a dead end.
 */
export function useGitHubOAuthEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ github?: unknown }>("/api/oauth/config")
      .then((res) => {
        if (!cancelled) setEnabled(res?.github === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
