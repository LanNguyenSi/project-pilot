"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

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
