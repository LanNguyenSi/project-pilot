"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center py-12 px-4">
        <div className="w-full max-w-sm animate-fade-in">
          <BrandMark />
          <Card variant="elevated" className="p-6 text-center">
            <p className="text-sm text-content-secondary mb-4">Invalid or missing reset link.</p>
            <Link href="/forgot-password" className="text-sm text-brand-300 hover:text-brand-400 transition-colors">
              Request a new reset link
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <BrandMark />

        <Card variant="elevated" className="p-6">
          <div className="text-center mb-6">
            <h1 className="text-section-title text-content-primary">Set new password</h1>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-content-secondary">
                Password updated successfully. All sessions have been revoked.
              </p>
              <Link href="/login" className="text-sm text-brand-300 hover:text-brand-400 transition-colors">
                Sign in with your new password
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="New password"
                type="password"
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="Confirm password"
                type="password"
                placeholder="Repeat password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error && <p className="text-accent-red text-sm">{error}</p>}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Reset password
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
