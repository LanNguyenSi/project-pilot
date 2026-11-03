"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * `pending` while the config request is in flight, so a caller can reserve the
 * space of whatever it would render for `enabled` instead of letting the layout
 * jump when the answer arrives.
 */
export type GitHubOAuthStatus = "pending" | "enabled" | "disabled";

/**
 * Whether the backend has GitHub OAuth configured. Fails closed: `pending`
 * while loading and `disabled` when the request fails, so the login page never
 * offers a button that leads to a dead end. `pending` is reported separately
 * from `disabled` only so the login card can hold its height across the
 * pending -> enabled transition.
 */
export function useGitHubOAuthStatus(): GitHubOAuthStatus {
  const [status, setStatus] = useState<GitHubOAuthStatus>("pending");
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ github?: unknown }>("/api/oauth/config")
      .then((res) => {
        if (!cancelled) setStatus(res?.github === true ? "enabled" : "disabled");
      })
      .catch(() => {
        if (!cancelled) setStatus("disabled");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
