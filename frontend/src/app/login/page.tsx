"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Shared brand mark used on all auth pages. */
function BrandMark() {
  return (
    <div className="flex flex-col items-center gap-2.5 mb-8">
      <div className="h-12 w-12 rounded-2xl bg-brand-500 flex items-center justify-center shadow-elevated">
        <span className="text-white text-xl font-bold font-display leading-none">P</span>
      </div>
      <span className="text-lg font-semibold font-display text-content-primary tracking-tight">
        project-pilot
      </span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
      } else {
        await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <BrandMark />

        <Card variant="elevated" className="p-6">
          <div className="text-center mb-5">
            <p className="text-content-secondary text-sm">
              {isRegister ? "Create your account" : "Sign in to continue"}
            </p>
          </div>

          {/* GitHub OAuth - full-page navigation so the browser follows the
              302 redirect dance. The callback lands back on /dashboard (or
              /auth/error on failure). */}
          <a
            href={`${API_URL}/api/oauth/github/start`}
            className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-button bg-[#24292e] hover:bg-[#1a1e22] border border-stroke-strong text-sm font-medium text-white transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </a>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px bg-stroke-subtle" />
            <span className="text-xs text-content-tertiary">or</span>
            <div className="flex-1 h-px bg-stroke-subtle" />
          </div>

          {/* Segmented sign-in / register control */}
          <div
            className="flex bg-surface-overlay rounded-button p-0.5 mb-5"
            role="group"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              aria-pressed={!isRegister}
              onClick={() => { setIsRegister(false); setError(""); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast ${
                !isRegister
                  ? "bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/20"
                  : "text-content-tertiary hover:text-content-secondary"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={isRegister}
              onClick={() => { setIsRegister(true); setError(""); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast ${
                isRegister
                  ? "bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/20"
                  : "text-content-tertiary hover:text-content-secondary"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <Input
                label="Name"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Minimum 8 characters"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className="text-accent-red text-sm">{error}</p>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {isRegister ? "Register" : "Sign in"}
            </Button>

            {!isRegister && (
              <div className="text-center">
                <Link href="/forgot-password" className="text-xs text-content-tertiary hover:text-brand-300 transition-colors">
                  Forgot password?
                </Link>
              </div>
            )}
          </form>
        </Card>
      </div>
    </main>
  );
}
