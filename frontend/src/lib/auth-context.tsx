"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  name: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

/**
 * Fetches the authenticated user once per (app) shell mount and shares it
 * with every consumer below (TopBar, Dashboard, ...). Replaces the
 * per-component `/api/auth/me` fetch each used to run independently,
 * including the one that used to re-run on the dashboard's 30s data
 * refresh.
 *
 * Errors are swallowed (a transient failure or a 401): consumers fall back
 * to their own "unknown user" UI, same as before. Each page still guards
 * its own domain data fetch and redirects to /login on 401 there; this
 * provider does not redirect on its own.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ user: User }>("/api/auth/me")
      .then((d) => { if (!cancelled) setUser(d.user); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
