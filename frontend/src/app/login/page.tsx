"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
    <main className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <h1 className="text-section-title text-content-primary">project-pilot</h1>
          <p className="text-content-secondary text-sm mt-1">
            {isRegister ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {/* GitHub OAuth — full-page navigation so the browser follows the
            302 redirect dance. The callback lands back on /dashboard (or
            /auth/error on failure). */}
        <a
          href={`${API_URL}/api/oauth/github/start`}
          className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-button bg-surface-secondary hover:bg-surface-tertiary text-sm font-medium text-content-primary transition-colors"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </a>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-px bg-surface-tertiary" />
          <span className="text-xs text-content-tertiary">or</span>
          <div className="flex-1 h-px bg-surface-tertiary" />
        </div>

        {/* Segmented control */}
        <div className="flex bg-surface-tertiary rounded-button p-0.5 mb-6">
          <button
            type="button"
            aria-pressed={!isRegister}
            onClick={() => { setIsRegister(false); setError(""); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast ${
              !isRegister ? "bg-surface-secondary text-content-primary shadow-sm" : "text-content-tertiary"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={isRegister}
            onClick={() => { setIsRegister(true); setError(""); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast ${
              isRegister ? "bg-surface-secondary text-content-primary shadow-sm" : "text-content-tertiary"
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
              <Link href="/forgot-password" className="text-xs text-content-tertiary hover:text-content-primary transition-colors">
                Forgot password?
              </Link>
            </div>
          )}
        </form>
      </Card>
    </main>
  );
}
